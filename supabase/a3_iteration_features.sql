create extension if not exists pgcrypto with schema extensions;

alter table public.profiles
add column if not exists university text not null default 'RMIT University',
add column if not exists is_available boolean not null default true;

update public.profiles
set university = 'RMIT University'
where university is null or trim(university) = '';

update public.profiles
set is_available = true
where is_available is null;

alter table public.connections
add column if not exists connection_context text,
add column if not exists ai_match_summary jsonb;

update public.connections
set connection_context = case
  when sender_team_request_id is null then 'discover'
  else 'team_request'
end
where connection_context is null;

alter table public.connections
alter column connection_context set default 'team_request';

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.connections'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%connection_context%'
  loop
    execute format('alter table public.connections drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.connections
add constraint connections_context_check
check (connection_context in ('team_request', 'discover'));

create index if not exists connections_context_status_idx
on public.connections(connection_context, status);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_profile_id uuid not null references public.profiles(id) on delete cascade,
  reviewed_profile_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  team_request_id uuid not null references public.team_requests(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  review_text text,
  created_at timestamptz not null default now(),
  constraint reviews_no_self_review check (reviewer_profile_id <> reviewed_profile_id),
  constraint reviews_unique_interaction unique (reviewer_profile_id, reviewed_profile_id, connection_id, team_request_id)
);

create index if not exists reviews_reviewed_profile_idx
on public.reviews(reviewed_profile_id, created_at desc);

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

drop policy if exists "Authenticated can insert own valid reviews" on public.reviews;
create policy "Authenticated can insert own valid reviews"
on public.reviews
for insert
to authenticated
with check (
  public.owns_profile(reviewer_profile_id)
  and reviewer_profile_id <> reviewed_profile_id
);

create table if not exists public.match_feedback (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  team_request_id uuid not null references public.team_requests(id) on delete cascade,
  reviewer_profile_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null check (score between 1 and 5),
  feedback_text text,
  created_at timestamptz not null default now(),
  constraint match_feedback_unique_interaction unique (connection_id, team_request_id, reviewer_profile_id)
);

create index if not exists match_feedback_request_idx
on public.match_feedback(team_request_id, created_at desc);

alter table public.match_feedback enable row level security;
revoke all on public.match_feedback from anon;
grant select on public.match_feedback to authenticated;

drop policy if exists "Authenticated can read own match feedback" on public.match_feedback;
create policy "Authenticated can read own match feedback"
on public.match_feedback
for select
to authenticated
using (public.owns_profile(reviewer_profile_id));

drop policy if exists "Authenticated can insert own match feedback" on public.match_feedback;
create policy "Authenticated can insert own match feedback"
on public.match_feedback
for insert
to authenticated
with check (public.owns_profile(reviewer_profile_id));

create table if not exists public.ai_match_results (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.team_requests(id) on delete cascade,
  candidate_profile_id uuid not null references public.profiles(id) on delete cascade,
  candidate_request_id uuid references public.team_requests(id) on delete set null,
  rule_based_score integer not null check (rule_based_score between 0 and 100),
  ai_score integer check (ai_score between 0 and 100),
  explanation text,
  strengths text[] not null default '{}',
  potential_gaps text[] not null default '{}',
  fallback_used boolean not null default false,
  generated_at timestamptz not null default now()
);

create index if not exists ai_match_results_request_idx
on public.ai_match_results(request_id, generated_at desc);

alter table public.ai_match_results enable row level security;
revoke all on public.ai_match_results from anon;
grant select, insert on public.ai_match_results to authenticated;

drop policy if exists "Authenticated can read own AI match results" on public.ai_match_results;
create policy "Authenticated can read own AI match results"
on public.ai_match_results
for select
to authenticated
using (
  exists (
    select 1
    from public.team_requests tr
    join public.profiles p on p.id = tr.profile_id
    where tr.id = ai_match_results.request_id
      and p.owner_id = auth.uid()
  )
);

drop policy if exists "Authenticated can insert own AI match results" on public.ai_match_results;
create policy "Authenticated can insert own AI match results"
on public.ai_match_results
for insert
to authenticated
with check (
  exists (
    select 1
    from public.team_requests tr
    join public.profiles p on p.id = tr.profile_id
    where tr.id = ai_match_results.request_id
      and p.owner_id = auth.uid()
  )
);

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

create or replace function public.public_profile_json(profile_row public.profiles)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', profile_row.id,
    'full_name', profile_row.full_name,
    'university', profile_row.university,
    'school', profile_row.school,
    'major', profile_row.major,
    'skills', profile_row.skills,
    'contact_type', case
      when profile_row.is_demo then null
      when public.owns_profile(profile_row.id) or public.has_accepted_connection_with_profile(profile_row.id) then profile_row.contact_type
      else null
    end,
    'contact_value', case
      when profile_row.is_demo then null
      when public.owns_profile(profile_row.id) or public.has_accepted_connection_with_profile(profile_row.id) then profile_row.contact_value
      else null
    end,
    'short_bio', profile_row.short_bio,
    'is_demo', profile_row.is_demo,
    'is_available', profile_row.is_available,
    'created_at', profile_row.created_at,
    'consent_public_visibility', profile_row.consent_public_visibility,
    'review_summary', public.review_summary(profile_row.id)
  );
$$;

drop function if exists public.list_public_profiles();
create or replace function public.list_public_profiles()
returns table(
  id uuid,
  full_name text,
  university text,
  school text,
  major text,
  skills text[],
  contact_type text,
  contact_value text,
  short_bio text,
  is_demo boolean,
  is_available boolean,
  created_at timestamptz,
  consent_public_visibility boolean,
  review_summary jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.university,
    p.school,
    p.major,
    p.skills,
    case
      when p.is_demo then null
      when public.owns_profile(p.id) or public.has_accepted_connection_with_profile(p.id) then p.contact_type
      else null
    end as contact_type,
    case
      when p.is_demo then null
      when public.owns_profile(p.id) or public.has_accepted_connection_with_profile(p.id) then p.contact_value
      else null
    end as contact_value,
    p.short_bio,
    p.is_demo,
    p.is_available,
    p.created_at,
    p.consent_public_visibility,
    public.review_summary(p.id) as review_summary
  from public.profiles p
  where (p.is_demo = true or p.consent_public_visibility = true or p.owner_id = auth.uid())
    and (p.is_available = true or p.owner_id = auth.uid())
  order by p.is_demo asc, p.created_at desc;
$$;

drop function if exists public.get_public_profile(uuid);
create or replace function public.get_public_profile(requested_profile uuid)
returns table(
  id uuid,
  full_name text,
  university text,
  school text,
  major text,
  skills text[],
  contact_type text,
  contact_value text,
  short_bio text,
  is_demo boolean,
  is_available boolean,
  created_at timestamptz,
  consent_public_visibility boolean,
  review_summary jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.university,
    p.school,
    p.major,
    p.skills,
    case
      when p.is_demo then null
      when public.owns_profile(p.id) or public.has_accepted_connection_with_profile(p.id) then p.contact_type
      else null
    end as contact_type,
    case
      when p.is_demo then null
      when public.owns_profile(p.id) or public.has_accepted_connection_with_profile(p.id) then p.contact_value
      else null
    end as contact_value,
    p.short_bio,
    p.is_demo,
    p.is_available,
    p.created_at,
    p.consent_public_visibility,
    public.review_summary(p.id) as review_summary
  from public.profiles p
  where p.id = requested_profile
    and (p.is_demo = true or p.consent_public_visibility = true or p.owner_id = auth.uid())
  limit 1;
$$;

drop function if exists public.update_profile(uuid, text, text, text, text[], text, text, text);
drop function if exists public.update_profile(uuid, text, text, text, text, text[], text, text, text, boolean);
create or replace function public.update_profile(
  p_profile_id uuid,
  p_university text,
  p_school text,
  p_major text,
  p_full_name text,
  p_skills text[],
  p_contact_type text,
  p_contact_value text,
  p_short_bio text,
  p_is_available boolean
)
returns table(
  id uuid,
  full_name text,
  university text,
  school text,
  major text,
  skills text[],
  contact_type text,
  contact_value text,
  short_bio text,
  is_demo boolean,
  is_available boolean,
  created_at timestamptz,
  consent_public_visibility boolean,
  review_summary jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.profiles p
  set
    university = coalesce(nullif(trim(p_university), ''), 'RMIT University'),
    full_name = trim(p_full_name),
    school = trim(p_school),
    major = trim(p_major),
    skills = p_skills,
    contact_type = p_contact_type,
    contact_value = trim(p_contact_value),
    short_bio = trim(p_short_bio),
    is_available = coalesce(p_is_available, true),
    consent_public_visibility = true
  where p.id = p_profile_id
    and p.owner_id = auth.uid()
    and p.is_demo = false
  returning
    p.id,
    p.full_name,
    p.university,
    p.school,
    p.major,
    p.skills,
    p.contact_type,
    p.contact_value,
    p.short_bio,
    p.is_demo,
    p.is_available,
    p.created_at,
    p.consent_public_visibility,
    public.review_summary(p.id);
end;
$$;

create or replace function public.list_active_team_requests()
returns table(
  id uuid,
  profile_id uuid,
  school text,
  major text,
  course text,
  course_name text,
  course_code text,
  class_session text,
  skills_needed text[],
  members_needed integer,
  total_team_size integer,
  teammates_needed_initial integer,
  availability text[],
  preferred_active_time text,
  work_style text,
  work_styles text[],
  requirements text,
  requirements_data jsonb,
  requires_portfolio boolean,
  portfolio_reference_path text,
  portfolio_reference_name text,
  status text,
  created_at timestamptz,
  profile jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    tr.id,
    tr.profile_id,
    tr.school,
    tr.major,
    tr.course,
    tr.course_name,
    tr.course_code,
    tr.class_session,
    tr.skills_needed,
    tr.members_needed,
    tr.total_team_size,
    tr.teammates_needed_initial,
    tr.availability,
    tr.preferred_active_time,
    tr.work_style,
    tr.work_styles,
    tr.requirements,
    tr.requirements_data,
    tr.requires_portfolio,
    tr.portfolio_reference_path,
    tr.portfolio_reference_name,
    tr.status,
    tr.created_at,
    public.public_profile_json(p) as profile
  from public.team_requests tr
  join public.profiles p on p.id = tr.profile_id
  where tr.status = 'looking'
    and (p.is_demo = true or p.consent_public_visibility = true or p.owner_id = auth.uid())
    and (p.is_available = true or p.owner_id = auth.uid())
  order by tr.created_at desc;
$$;

drop function if exists public.send_connection_request(uuid, uuid, uuid, text);
create or replace function public.send_connection_request(
  sender_profile uuid,
  receiver_profile uuid,
  sender_request uuid,
  intro_message text
)
returns table(id uuid, status text, connection_context text)
language plpgsql
security definer
set search_path = public
as $$
declare
  receiver_exists boolean;
  receiver_request uuid;
  created_connection public.connections;
  next_context text;
begin
  if not public.owns_profile(sender_profile) then
    raise exception 'Sender profile ownership required.';
  end if;

  select true into receiver_exists
  from public.profiles
  where profiles.id = receiver_profile
    and (profiles.is_demo = true or (profiles.consent_public_visibility = true and profiles.is_available = true));

  if receiver_exists is null then
    raise exception 'Receiver profile does not exist.';
  end if;

  if sender_request is not null and not exists (
    select 1
    from public.team_requests tr
    where tr.id = sender_request
      and tr.profile_id = sender_profile
      and tr.status = 'looking'
  ) then
    raise exception 'Sender request is not active.';
  end if;

  next_context := case when sender_request is null then 'discover' else 'team_request' end;

  if sender_request is not null then
    receiver_request := public.find_receiver_team_request(sender_request, receiver_profile);
  end if;

  select c.* into created_connection
  from public.connections c
  where least(c.sender_profile_id, c.receiver_profile_id) = least(sender_profile, receiver_profile)
    and greatest(c.sender_profile_id, c.receiver_profile_id) = greatest(sender_profile, receiver_profile)
    and c.status in ('pending', 'accepted')
    and c.connection_context = next_context
  limit 1;

  if created_connection.id is not null then
    return query select created_connection.id, created_connection.status, created_connection.connection_context;
    return;
  end if;

  insert into public.connections (
    sender_profile_id,
    receiver_profile_id,
    sender_team_request_id,
    receiver_team_request_id,
    connection_context,
    intro_message,
    status
  )
  values (
    sender_profile,
    receiver_profile,
    sender_request,
    receiver_request,
    next_context,
    nullif(trim(coalesce(intro_message, '')), ''),
    'pending'
  )
  returning * into created_connection;

  perform public.create_notification(receiver_profile, sender_profile, 'connection_request', created_connection.id, null);

  return query select created_connection.id, created_connection.status, created_connection.connection_context;
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

drop function if exists public.list_friends(uuid);
create or replace function public.list_friends(current_profile uuid)
returns table(
  connection_id uuid,
  teammate_profile_id uuid,
  teammate_full_name text,
  teammate_university text,
  teammate_school text,
  teammate_major text,
  teammate_skills text[],
  teammate_is_demo boolean,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    p.id,
    p.full_name,
    p.university,
    p.school,
    p.major,
    p.skills,
    p.is_demo,
    c.updated_at
  from public.connections c
  join public.profiles p
    on p.id = case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end
  where public.owns_profile(current_profile)
    and c.status = 'accepted'
    and c.connection_context = 'discover'
    and current_profile in (c.sender_profile_id, c.receiver_profile_id)
  order by c.updated_at desc;
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
returns table(id uuid, rating integer, review_text text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  connection_row public.connections;
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

  return query
  insert into public.reviews (
    reviewer_profile_id,
    reviewed_profile_id,
    connection_id,
    team_request_id,
    rating,
    review_text
  )
  values (
    reviewer_profile,
    reviewed_profile,
    connection_request,
    team_request,
    rating_value,
    nullif(trim(coalesce(review_body, '')), '')
  )
  on conflict (reviewer_profile_id, reviewed_profile_id, connection_id, team_request_id)
  do update set
    rating = excluded.rating,
    review_text = excluded.review_text
  returning reviews.id, reviews.rating, reviews.review_text, reviews.created_at;
end;
$$;

drop function if exists public.list_profile_reviews(uuid);
create or replace function public.list_profile_reviews(requested_profile uuid)
returns table(
  id uuid,
  rating integer,
  review_text text,
  created_at timestamptz,
  reviewer_name text
)
language sql
security definer
set search_path = public
as $$
  select
    r.id,
    r.rating,
    r.review_text,
    r.created_at,
    reviewer.full_name
  from public.reviews r
  join public.profiles reviewer on reviewer.id = r.reviewer_profile_id
  join public.profiles reviewed on reviewed.id = r.reviewed_profile_id
  where r.reviewed_profile_id = requested_profile
    and (reviewed.is_demo = true or reviewed.consent_public_visibility = true or reviewed.owner_id = auth.uid())
  order by r.created_at desc;
$$;

drop function if exists public.create_match_feedback(uuid, uuid, uuid, integer, text);
create or replace function public.create_match_feedback(
  connection_request uuid,
  team_request uuid,
  reviewer_profile uuid,
  score_value integer,
  feedback_body text
)
returns table(id uuid, score integer, feedback_text text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  connection_row public.connections;
begin
  if not public.owns_profile(reviewer_profile) then
    raise exception 'Reviewer profile ownership required.';
  end if;

  if score_value < 1 or score_value > 5 then
    raise exception 'Feedback score must be between 1 and 5.';
  end if;

  select * into connection_row
  from public.connections c
  where c.id = connection_request
    and c.connection_context = 'team_request'
    and c.status in ('accepted', 'unmatched')
    and reviewer_profile in (c.sender_profile_id, c.receiver_profile_id);

  if connection_row.id is null then
    raise exception 'A teammate connection is required before match feedback.';
  end if;

  if team_request not in (connection_row.sender_team_request_id, connection_row.receiver_team_request_id) then
    raise exception 'Feedback must belong to the connected team request.';
  end if;

  return query
  insert into public.match_feedback (
    connection_id,
    team_request_id,
    reviewer_profile_id,
    score,
    feedback_text
  )
  values (
    connection_request,
    team_request,
    reviewer_profile,
    score_value,
    nullif(trim(coalesce(feedback_body, '')), '')
  )
  on conflict (connection_id, team_request_id, reviewer_profile_id)
  do update set
    score = excluded.score,
    feedback_text = excluded.feedback_text
  returning match_feedback.id, match_feedback.score, match_feedback.feedback_text, match_feedback.created_at;
end;
$$;

grant execute on function public.update_profile(uuid, text, text, text, text, text[], text, text, text, boolean) to authenticated;
grant execute on function public.list_public_profiles() to anon, authenticated;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;
grant execute on function public.list_active_team_requests() to anon, authenticated;
grant execute on function public.send_connection_request(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.get_connection_between(uuid, uuid) to authenticated;
grant execute on function public.get_connection_between_for_context(uuid, uuid, text) to authenticated;
grant execute on function public.get_connection_detail(uuid, uuid) to authenticated;
grant execute on function public.list_friends(uuid) to authenticated;
grant execute on function public.create_review(uuid, uuid, uuid, uuid, integer, text) to authenticated;
grant execute on function public.list_profile_reviews(uuid) to anon, authenticated;
grant execute on function public.create_match_feedback(uuid, uuid, uuid, integer, text) to authenticated;

drop function if exists public.get_team_request_progress(uuid, uuid);
create or replace function public.get_team_request_progress(
  request_id uuid,
  current_profile uuid
)
returns table(
  found_count integer,
  matched_count integer,
  existing_members integer,
  total_team_size integer,
  remaining_spots integer,
  teammates jsonb
)
language sql
security definer
set search_path = public
as $$
  with allowed_request as (
    select
      tr.*,
      greatest(0, tr.total_team_size - tr.teammates_needed_initial) as existing_count
    from public.team_requests tr
    where tr.id = request_id
      and tr.profile_id = current_profile
      and public.owns_profile(current_profile)
  ),
  matched as (
    select distinct on (
      case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end
    )
      case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end as teammate_profile_id,
      c.id as connection_id,
      c.updated_at
    from public.connections c
    join allowed_request ar on (
      (c.sender_profile_id = current_profile and c.sender_team_request_id = ar.id)
      or (c.receiver_profile_id = current_profile and c.receiver_team_request_id = ar.id)
    )
    where c.status = 'accepted'
      and c.connection_context = 'team_request'
      and current_profile in (c.sender_profile_id, c.receiver_profile_id)
    order by
      case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end,
      c.updated_at desc
  ),
  totals as (
    select
      ar.total_team_size,
      ar.existing_count,
      count(m.teammate_profile_id)::integer as matched_count,
      least(ar.total_team_size, ar.existing_count + count(m.teammate_profile_id)::integer) as found_count
    from allowed_request ar
    left join matched m on true
    group by ar.total_team_size, ar.existing_count
  )
  select
    coalesce(t.found_count, 0)::integer as found_count,
    coalesce(t.matched_count, 0)::integer as matched_count,
    coalesce(t.existing_count, 0)::integer as existing_members,
    coalesce(t.total_team_size, 0)::integer as total_team_size,
    greatest(0, coalesce(t.total_team_size, 0) - coalesce(t.found_count, 0))::integer as remaining_spots,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'profile_id', p.id,
          'full_name', p.full_name,
          'major', p.major,
          'skills', p.skills,
          'is_demo', p.is_demo,
          'connection_id', m.connection_id,
          'active_request_id', active_request.id
        )
        order by m.updated_at desc
      ) filter (where p.id is not null),
      '[]'::jsonb
    ) as teammates
  from totals t
  left join matched m on true
  left join public.profiles p on p.id = m.teammate_profile_id
  left join lateral (
    select tr.id
    from public.team_requests tr
    where tr.profile_id = p.id
      and tr.status = 'looking'
    order by tr.created_at desc
    limit 1
  ) active_request on true
  group by t.found_count, t.matched_count, t.existing_count, t.total_team_size;
$$;

grant execute on function public.get_team_request_progress(uuid, uuid) to authenticated;
