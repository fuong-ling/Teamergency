create extension if not exists pgcrypto with schema extensions;

alter table public.connections
add column if not exists accepted_at timestamptz;

update public.connections
set accepted_at = coalesce(accepted_at, updated_at, created_at)
where status in ('accepted', 'unmatched')
  and accepted_at is null;

create or replace function public.review_wait_days()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select 30;
$$;

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_profile_id uuid references public.profiles(id) on delete cascade,
  reviewed_profile_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid references public.connections(id) on delete cascade,
  team_request_id uuid references public.team_requests(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  review_text text,
  eligible_at timestamptz not null default now(),
  is_demo boolean not null default false,
  demo_reviewer_name text,
  course_name text,
  review_context text,
  created_at timestamptz not null default now()
);

alter table public.reviews
alter column reviewer_profile_id drop not null,
alter column connection_id drop not null,
alter column team_request_id drop not null;

alter table public.reviews
add column if not exists eligible_at timestamptz not null default now(),
add column if not exists is_demo boolean not null default false,
add column if not exists demo_reviewer_name text,
add column if not exists course_name text,
add column if not exists review_context text;

update public.reviews
set eligible_at = coalesce(eligible_at, created_at)
where eligible_at is null;

create index if not exists reviews_reviewed_profile_idx
on public.reviews(reviewed_profile_id, created_at desc);

create unique index if not exists reviews_unique_real_interaction_idx
on public.reviews(reviewer_profile_id, reviewed_profile_id, connection_id, team_request_id)
where is_demo = false
  and reviewer_profile_id is not null
  and connection_id is not null
  and team_request_id is not null;

alter table public.reviews enable row level security;
revoke all on public.reviews from anon;
grant select on public.reviews to authenticated;

drop policy if exists "Authenticated can read visible reviews" on public.reviews;
create policy "Authenticated can read visible reviews"
on public.reviews
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = reviews.reviewed_profile_id
      and (p.is_demo = true or p.consent_public_visibility = true or p.owner_id = auth.uid())
  )
);

create table if not exists public.match_feedback (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.connections(id) on delete cascade,
  team_request_id uuid not null references public.team_requests(id) on delete cascade,
  reviewer_profile_id uuid not null references public.profiles(id) on delete cascade,
  score integer check (score between 1 and 5),
  usefulness_rating integer check (usefulness_rating between 1 and 5),
  feedback_text text,
  created_at timestamptz not null default now()
);

alter table public.match_feedback
alter column connection_id drop not null;

alter table public.match_feedback
add column if not exists usefulness_rating integer check (usefulness_rating between 1 and 5);

update public.match_feedback
set usefulness_rating = coalesce(usefulness_rating, score)
where usefulness_rating is null;

create index if not exists match_feedback_request_idx
on public.match_feedback(team_request_id, created_at desc);

create unique index if not exists match_feedback_connection_reviewer_unique_idx
on public.match_feedback(connection_id, team_request_id, reviewer_profile_id)
where connection_id is not null;

create unique index if not exists match_feedback_request_reviewer_unique_idx
on public.match_feedback(team_request_id, reviewer_profile_id)
where connection_id is null;

alter table public.match_feedback enable row level security;
revoke all on public.match_feedback from anon;
grant select on public.match_feedback to authenticated;

drop policy if exists "Authenticated can read own match feedback" on public.match_feedback;
create policy "Authenticated can read own match feedback"
on public.match_feedback
for select
to authenticated
using (public.owns_profile(reviewer_profile_id));

create or replace function public.review_summary(profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'average_rating', round(coalesce(avg(r.rating), 0)::numeric, 1),
    'review_count', count(r.id)
  )
  from public.reviews r
  where r.reviewed_profile_id = profile_id;
$$;

create or replace function public.respond_connection_request(
  connection_request uuid,
  receiver_profile uuid,
  response_status text
)
returns table(id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_connection public.connections;
  receiver_request uuid;
begin
  if response_status not in ('accepted', 'declined') then
    raise exception 'Invalid connection response.';
  end if;

  if not public.owns_profile(receiver_profile) then
    raise exception 'Receiver profile ownership required.';
  end if;

  update public.connections c
  set
    status = response_status,
    accepted_at = case when response_status = 'accepted' then now() else c.accepted_at end
  where c.id = connection_request
    and c.receiver_profile_id = receiver_profile
    and c.status = 'pending'
  returning * into updated_connection;

  if updated_connection.id is null then
    return;
  end if;

  if response_status = 'accepted' then
    if updated_connection.sender_team_request_id is not null and updated_connection.receiver_team_request_id is null then
      receiver_request := public.find_receiver_team_request(updated_connection.sender_team_request_id, receiver_profile);

      if receiver_request is not null then
        update public.connections c
        set receiver_team_request_id = receiver_request
        where c.id = updated_connection.id
        returning * into updated_connection;
      end if;
    end if;

    perform public.create_notification(updated_connection.sender_profile_id, receiver_profile, 'connection_accepted', updated_connection.id, null);
  else
    perform public.create_notification(updated_connection.sender_profile_id, receiver_profile, 'connection_declined', updated_connection.id, null);
  end if;

  return query select updated_connection.id, updated_connection.status;
end;
$$;

drop function if exists public.get_connection_between(uuid, uuid);
create or replace function public.get_connection_between(
  current_profile uuid,
  teammate_profile uuid
)
returns table(
  id uuid,
  sender_profile_id uuid,
  receiver_profile_id uuid,
  sender_team_request_id uuid,
  receiver_team_request_id uuid,
  connection_context text,
  status text,
  accepted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  unmatched_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.sender_profile_id,
    c.receiver_profile_id,
    c.sender_team_request_id,
    c.receiver_team_request_id,
    c.connection_context,
    c.status,
    c.accepted_at,
    c.created_at,
    c.updated_at,
    c.unmatched_at
  from public.connections c
  where public.owns_profile(current_profile)
    and least(c.sender_profile_id, c.receiver_profile_id) = least(current_profile, teammate_profile)
    and greatest(c.sender_profile_id, c.receiver_profile_id) = greatest(current_profile, teammate_profile)
  order by c.created_at desc
  limit 1;
$$;

drop function if exists public.get_connection_between_for_context(uuid, uuid, text);
create or replace function public.get_connection_between_for_context(
  current_profile uuid,
  teammate_profile uuid,
  requested_context text
)
returns table(
  id uuid,
  sender_profile_id uuid,
  receiver_profile_id uuid,
  sender_team_request_id uuid,
  receiver_team_request_id uuid,
  connection_context text,
  status text,
  accepted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  unmatched_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.sender_profile_id,
    c.receiver_profile_id,
    c.sender_team_request_id,
    c.receiver_team_request_id,
    c.connection_context,
    c.status,
    c.accepted_at,
    c.created_at,
    c.updated_at,
    c.unmatched_at
  from public.connections c
  where public.owns_profile(current_profile)
    and c.connection_context = requested_context
    and least(c.sender_profile_id, c.receiver_profile_id) = least(current_profile, teammate_profile)
    and greatest(c.sender_profile_id, c.receiver_profile_id) = greatest(current_profile, teammate_profile)
  order by c.created_at desc
  limit 1;
$$;

drop function if exists public.get_connection_detail(uuid, uuid);
create or replace function public.get_connection_detail(
  connection_request uuid,
  current_profile uuid
)
returns table(
  id uuid,
  sender_profile_id uuid,
  receiver_profile_id uuid,
  sender_team_request_id uuid,
  receiver_team_request_id uuid,
  connection_context text,
  status text,
  accepted_at timestamptz,
  teammate_profile_id uuid,
  teammate_full_name text,
  teammate_major text,
  teammate_is_demo boolean
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.sender_profile_id,
    c.receiver_profile_id,
    c.sender_team_request_id,
    c.receiver_team_request_id,
    c.connection_context,
    c.status,
    c.accepted_at,
    case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end as teammate_profile_id,
    p.full_name as teammate_full_name,
    p.major as teammate_major,
    p.is_demo as teammate_is_demo
  from public.connections c
  join public.profiles p
    on p.id = case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end
  where public.owns_profile(current_profile)
    and c.id = connection_request
    and current_profile in (c.sender_profile_id, c.receiver_profile_id)
  limit 1;
$$;

drop function if exists public.create_review(uuid, uuid, uuid, uuid, integer, text);
create or replace function public.create_review(
  reviewer_profile uuid,
  reviewed_profile uuid,
  connection_request uuid,
  team_request uuid,
  rating_value integer,
  review_body text
)
returns table(id uuid, rating integer, review_text text, eligible_at timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  connection_row public.connections;
  next_eligible_at timestamptz;
begin
  if not public.owns_profile(reviewer_profile) then
    raise exception 'Reviewer profile ownership required.';
  end if;

  if reviewer_profile = reviewed_profile then
    raise exception 'You cannot review yourself.';
  end if;

  if rating_value < 1 or rating_value > 5 then
    raise exception 'Rating must be between 1 and 5.';
  end if;

  select * into connection_row
  from public.connections c
  where c.id = connection_request
    and c.connection_context = 'team_request'
    and c.status in ('accepted', 'unmatched')
    and reviewer_profile in (c.sender_profile_id, c.receiver_profile_id)
    and reviewed_profile in (c.sender_profile_id, c.receiver_profile_id);

  if connection_row.id is null then
    raise exception 'A teammate connection is required before reviewing.';
  end if;

  if team_request not in (connection_row.sender_team_request_id, connection_row.receiver_team_request_id) then
    raise exception 'Review must belong to the connected team request.';
  end if;

  next_eligible_at := coalesce(connection_row.accepted_at, connection_row.updated_at, connection_row.created_at)
    + make_interval(days => public.review_wait_days());

  if now() < next_eligible_at then
    raise exception 'Review is not available yet.';
  end if;

  return query
  insert into public.reviews (
    reviewer_profile_id,
    reviewed_profile_id,
    connection_id,
    team_request_id,
    rating,
    review_text,
    eligible_at,
    is_demo
  )
  values (
    reviewer_profile,
    reviewed_profile,
    connection_request,
    team_request,
    rating_value,
    nullif(trim(coalesce(review_body, '')), ''),
    next_eligible_at,
    false
  )
  returning reviews.id, reviews.rating, reviews.review_text, reviews.eligible_at, reviews.created_at;
end;
$$;

drop function if exists public.list_profile_reviews(uuid);
create or replace function public.list_profile_reviews(requested_profile uuid)
returns table(
  id uuid,
  rating integer,
  review_text text,
  eligible_at timestamptz,
  created_at timestamptz,
  reviewer_name text,
  course_name text,
  review_context text,
  is_demo boolean
)
language sql
security definer
set search_path = public
as $$
  select
    r.id,
    r.rating,
    r.review_text,
    r.eligible_at,
    r.created_at,
    coalesce(r.demo_reviewer_name, reviewer.full_name) as reviewer_name,
    r.course_name,
    r.review_context,
    r.is_demo
  from public.reviews r
  left join public.profiles reviewer on reviewer.id = r.reviewer_profile_id
  join public.profiles reviewed on reviewed.id = r.reviewed_profile_id
  where r.reviewed_profile_id = requested_profile
    and (reviewed.is_demo = true or reviewed.consent_public_visibility = true or reviewed.owner_id = auth.uid())
  order by r.created_at desc;
$$;

drop function if exists public.create_match_usefulness_feedback(uuid, uuid, uuid, integer, text);
create or replace function public.create_match_usefulness_feedback(
  team_request uuid,
  reviewer_profile uuid,
  connection_request uuid,
  rating_value integer,
  feedback_body text
)
returns table(id uuid, usefulness_rating integer, feedback_text text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.owns_profile(reviewer_profile) then
    raise exception 'Reviewer profile ownership required.';
  end if;

  if rating_value < 1 or rating_value > 5 then
    raise exception 'Usefulness rating must be between 1 and 5.';
  end if;

  if not exists (
    select 1
    from public.team_requests tr
    where tr.id = team_request
      and tr.profile_id = reviewer_profile
  ) then
    raise exception 'Team request ownership required.';
  end if;

  if connection_request is not null and not exists (
    select 1
    from public.connections c
    where c.id = connection_request
      and c.connection_context = 'team_request'
      and c.status in ('accepted', 'unmatched')
      and reviewer_profile in (c.sender_profile_id, c.receiver_profile_id)
      and team_request in (c.sender_team_request_id, c.receiver_team_request_id)
  ) then
    raise exception 'Connection does not belong to this team request.';
  end if;

  return query
  insert into public.match_feedback (
    connection_id,
    team_request_id,
    reviewer_profile_id,
    score,
    usefulness_rating,
    feedback_text
  )
  values (
    connection_request,
    team_request,
    reviewer_profile,
    rating_value,
    rating_value,
    nullif(trim(coalesce(feedback_body, '')), '')
  )
  on conflict (team_request_id, reviewer_profile_id) where connection_id is null
  do update set
    score = excluded.score,
    usefulness_rating = excluded.usefulness_rating,
    feedback_text = excluded.feedback_text
  returning match_feedback.id, match_feedback.usefulness_rating, match_feedback.feedback_text, match_feedback.created_at;
end;
$$;

delete from public.reviews
where is_demo = true
  and reviewed_profile_id in (select id from public.profiles where is_demo = true);

with demo_targets as (
  select
    p.id,
    p.major,
    p.school,
    coalesce(tr.course_name, tr.course, 'Team Project') as active_course,
    row_number() over (order by p.created_at, p.id) as profile_index
  from public.profiles p
  left join lateral (
    select tr.course_name, tr.course
    from public.team_requests tr
    where tr.profile_id = p.id
    order by tr.created_at desc
    limit 1
  ) tr on true
  where p.is_demo = true
),
demo_reviews as (
  select
    id as reviewed_profile_id,
    unnest(array[
      'Linh Pham',
      'Daniel Park',
      'Sarah Lim'
    ]) as reviewer_name,
    unnest(array[
      case
        when school = 'TBS' then 'Marketing Principles'
        when school = 'SSET' then 'Web Programming'
        else 'Digital Media Studio 3'
      end,
      active_course,
      case
        when school = 'TBS' then 'Market Research'
        when school = 'SSET' then 'Software Engineering Fundamentals'
        else 'Creative Coding'
      end
    ]) as course_name,
    unnest(array[
      '1 semester together',
      'last semester group assignment',
      'final project collaboration'
    ]) as review_context,
    unnest(array[
      5,
      case when profile_index % 3 = 0 then 4 else 5 end,
      4
    ]) as rating,
    unnest(array[
      case
        when school = 'TBS' then 'We worked together on a business group assignment. They were proactive, organised, and helped the team stay on track.'
        when school = 'SSET' then 'We were in the same programming group last semester. They explained technical ideas clearly and followed through on their tasks.'
        else 'I worked with them for one semester in Digital Media Studio 3. They were reliable, communicated clearly, and always completed their tasks on time.'
      end,
      case
        when school = 'TBS' then 'Their research and presentation skills were really useful for our project. They were easy to coordinate with.'
        when school = 'SSET' then 'Their technical skills were helpful and they were patient when the group needed to debug issues together.'
        else 'They contributed strong creative ideas and were responsive throughout the project.'
      end,
      case
        when school = 'TBS' then 'A dependable teammate who helped when the group had problems and kept communication clear.'
        when school = 'SSET' then 'They handled their part well and were comfortable collaborating on shared code and documentation.'
        else 'They brought good visual and technical judgement to the team and were easy to work with.'
      end
    ]) as review_text
  from demo_targets
)
insert into public.reviews (
  reviewed_profile_id,
  rating,
  review_text,
  eligible_at,
  is_demo,
  demo_reviewer_name,
  course_name,
  review_context,
  created_at
)
select
  reviewed_profile_id,
  rating,
  review_text,
  now() - interval '90 days',
  true,
  reviewer_name,
  course_name,
  review_context,
  now() - interval '30 days'
from demo_reviews;

grant execute on function public.review_wait_days() to anon, authenticated;
grant execute on function public.respond_connection_request(uuid, uuid, text) to authenticated;
grant execute on function public.get_connection_between(uuid, uuid) to authenticated;
grant execute on function public.get_connection_between_for_context(uuid, uuid, text) to authenticated;
grant execute on function public.get_connection_detail(uuid, uuid) to authenticated;
grant execute on function public.create_review(uuid, uuid, uuid, uuid, integer, text) to authenticated;
grant execute on function public.list_profile_reviews(uuid) to anon, authenticated;
grant execute on function public.create_match_usefulness_feedback(uuid, uuid, uuid, integer, text) to authenticated;
