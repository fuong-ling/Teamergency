-- Teamergency iteration: Match+, flexible class day/time, and strict request matching.
-- Safe migration: adds columns/table/functions without deleting existing real user data.

create extension if not exists pgcrypto;

alter table public.connections
add column if not exists receiver_team_request_id uuid references public.team_requests(id) on delete set null,
add column if not exists connection_context text not null default 'discover',
add column if not exists relationship_type text not null default 'friend',
add column if not exists accepted_at timestamptz,
add column if not exists unmatched_by_profile_id uuid references public.profiles(id) on delete set null,
add column if not exists unmatch_reason text,
add column if not exists unmatch_note text,
add column if not exists unmatched_at timestamptz;

update public.connections
set connection_context = case
  when sender_team_request_id is null then 'discover'
  else 'team_request'
end
where connection_context is null;

update public.connections
set relationship_type = case
  when sender_team_request_id is null or connection_context = 'discover' then 'friend'
  else relationship_type
end
where relationship_type is null
   or relationship_type not in ('friend', 'teammate');

alter table public.team_requests
add column if not exists class_day text,
add column if not exists class_start_time time,
add column if not exists class_end_time time,
add column if not exists updated_at timestamptz not null default now();

update public.team_requests
set
  class_day = coalesce(class_day, nullif(split_part(class_session, ' ', 1), '')),
  class_start_time = coalesce(
    class_start_time,
    case
      when split_part(class_session, ' ', 2) ~ '^[0-2][0-9]:[0-5][0-9]$'
      then split_part(class_session, ' ', 2)::time
      else null
    end
  ),
  class_end_time = coalesce(
    class_end_time,
    case
      when split_part(class_session, ' ', 3) ~ '^[0-2][0-9]:[0-5][0-9]$'
      then split_part(class_session, ' ', 3)::time
      else null
    end
  )
where class_session is not null
  and trim(class_session) <> '';

update public.team_requests
set class_session = trim(concat_ws(
  ' ',
  class_day,
  to_char(class_start_time, 'HH24:MI'),
  case when class_end_time is null then null else to_char(class_end_time, 'HH24:MI') end
))
where class_day is not null
  and class_start_time is not null;

create index if not exists team_requests_class_day_start_idx
on public.team_requests(class_day, class_start_time);

create or replace function public.sync_team_request_session_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.class_day is null and new.class_session is not null then
    new.class_day := nullif(split_part(new.class_session, ' ', 1), '');
  end if;

  if new.class_start_time is null and new.class_session is not null and split_part(new.class_session, ' ', 2) ~ '^[0-2][0-9]:[0-5][0-9]$' then
    new.class_start_time := split_part(new.class_session, ' ', 2)::time;
  end if;

  if new.class_end_time is null and new.class_session is not null and split_part(new.class_session, ' ', 3) ~ '^[0-2][0-9]:[0-5][0-9]$' then
    new.class_end_time := split_part(new.class_session, ' ', 3)::time;
  end if;

  if new.class_day is not null and new.class_start_time is not null then
    new.class_session := trim(concat_ws(
      ' ',
      new.class_day,
      to_char(new.class_start_time, 'HH24:MI'),
      case when new.class_end_time is null then null else to_char(new.class_end_time, 'HH24:MI') end
    ));
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sync_team_request_session_fields_trigger on public.team_requests;
create trigger sync_team_request_session_fields_trigger
before insert or update on public.team_requests
for each row
execute function public.sync_team_request_session_fields();

create table if not exists public.teammate_relationships (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  profile_a_id uuid not null references public.profiles(id) on delete cascade,
  profile_b_id uuid not null references public.profiles(id) on delete cascade,
  request_a_id uuid not null references public.team_requests(id) on delete cascade,
  request_b_id uuid references public.team_requests(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint teammate_relationships_status_check check (status in ('active', 'ended')),
  constraint teammate_relationships_no_self_profile check (profile_a_id <> profile_b_id),
  constraint teammate_relationships_no_same_request check (request_a_id <> request_b_id)
);

alter table public.teammate_relationships
alter column request_b_id drop not null;

drop index if exists teammate_relationships_unique_active_pair_idx;

create unique index if not exists teammate_relationships_unique_active_request_teammate_idx
on public.teammate_relationships(
  request_a_id,
  least(profile_a_id::text, profile_b_id::text),
  greatest(profile_a_id::text, profile_b_id::text)
)
where status = 'active';

create index if not exists teammate_relationships_active_pair_idx
on public.teammate_relationships(
  least(request_a_id::text, request_b_id::text),
  greatest(request_a_id::text, request_b_id::text)
)
where status = 'active';

create index if not exists teammate_relationships_request_a_idx
on public.teammate_relationships(request_a_id, status);

create index if not exists teammate_relationships_request_b_idx
on public.teammate_relationships(request_b_id, status);

alter table public.teammate_relationships enable row level security;
revoke all on public.teammate_relationships from anon;
grant select on public.teammate_relationships to authenticated;

drop policy if exists "Authenticated can read own teammate relationships" on public.teammate_relationships;
create policy "Authenticated can read own teammate relationships"
on public.teammate_relationships
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.owner_id = auth.uid()
      and p.id in (teammate_relationships.profile_a_id, teammate_relationships.profile_b_id)
  )
);

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%type%'
  loop
    execute format('alter table public.notifications drop constraint %I', constraint_name);
  end loop;
exception
  when undefined_table then null;
end;
$$;

do $$
begin
  if to_regclass('public.notifications') is not null then
    alter table public.notifications
    add constraint notifications_type_check
    check (type in (
      'connection_request',
      'connection_accepted',
      'connection_declined',
      'connection_ended',
      'connection_unmatched',
      'new_message',
      'teammate_accepted',
      'teammate_matched'
    ));
  end if;
end;
$$;

drop function if exists public.create_notification(uuid, uuid, text, uuid, uuid);
create function public.create_notification(
  recipient_profile uuid,
  actor_profile uuid,
  notification_type text,
  connection_request uuid,
  message_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.notifications') is null then
    return;
  end if;

  if notification_type not in (
    'connection_request',
    'connection_accepted',
    'connection_declined',
    'connection_ended',
    'connection_unmatched',
    'new_message',
    'teammate_accepted',
    'teammate_matched'
  ) then
    return;
  end if;

  if recipient_profile is null or actor_profile is null or recipient_profile = actor_profile then
    return;
  end if;

  insert into public.notifications (
    recipient_profile_id,
    actor_profile_id,
    type,
    connection_id,
    message_id,
    is_read,
    created_at
  )
  values (
    recipient_profile,
    actor_profile,
    notification_type,
    connection_request,
    message_id,
    false,
    now()
  );
end;
$$;

drop function if exists public.request_course_key(uuid);
create function public.request_course_key(target_request uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(nullif(trim(course_code), ''), nullif(trim(course_name), ''), nullif(trim(course), '')))
  from public.team_requests
  where id = target_request;
$$;

drop function if exists public.requests_same_course_and_session(uuid, uuid);
create function public.requests_same_course_and_session(left_request uuid, right_request uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      public.request_course_key(l.id) = public.request_course_key(r.id)
      and lower(coalesce(l.class_day, split_part(l.class_session, ' ', 1), '')) =
          lower(coalesce(r.class_day, split_part(r.class_session, ' ', 1), ''))
      and coalesce(
        l.class_start_time,
        case
          when split_part(l.class_session, ' ', 2) ~ '^[0-2][0-9]:[0-5][0-9]$'
          then split_part(l.class_session, ' ', 2)::time
          else null
        end
      ) = coalesce(
        r.class_start_time,
        case
          when split_part(r.class_session, ' ', 2) ~ '^[0-2][0-9]:[0-5][0-9]$'
          then split_part(r.class_session, ' ', 2)::time
          else null
        end
      )
    from public.team_requests l
    join public.team_requests r on r.id = right_request
    where l.id = left_request
  ), false);
$$;

drop function if exists public.get_request_matched_teammate_count(uuid);
create function public.get_request_matched_teammate_count(target_request uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct case
    when tr.request_a_id = target_request then tr.profile_b_id
    else tr.profile_a_id
  end)::integer
  from public.teammate_relationships tr
  where tr.status = 'active'
    and target_request in (tr.request_a_id, tr.request_b_id);
$$;

drop function if exists public.get_request_remaining_spots(uuid);
create function public.get_request_remaining_spots(target_request uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select greatest(
      0,
      tr.total_team_size
      - least(
        tr.total_team_size,
        greatest(0, tr.total_team_size - tr.teammates_needed_initial)
          + public.get_request_matched_teammate_count(tr.id)
      )
    )::integer
    from public.team_requests tr
    where tr.id = target_request
      and tr.status = 'looking'
  ), 0);
$$;

insert into public.teammate_relationships (
  connection_id,
  profile_a_id,
  profile_b_id,
  request_a_id,
  request_b_id,
  status,
  created_at
)
select
  c.id,
  case when c.sender_profile_id::text < c.receiver_profile_id::text then c.sender_profile_id else c.receiver_profile_id end,
  case when c.sender_profile_id::text < c.receiver_profile_id::text then c.receiver_profile_id else c.sender_profile_id end,
  case when c.sender_team_request_id::text < c.receiver_team_request_id::text then c.sender_team_request_id else c.receiver_team_request_id end,
  case when c.sender_team_request_id::text < c.receiver_team_request_id::text then c.receiver_team_request_id else c.sender_team_request_id end,
  'active',
  coalesce(c.accepted_at, c.updated_at, c.created_at)
from public.connections c
where c.status = 'accepted'
  and c.relationship_type = 'teammate'
  and c.sender_team_request_id is not null
  and c.receiver_team_request_id is not null
  and public.requests_same_course_and_session(c.sender_team_request_id, c.receiver_team_request_id)
on conflict do nothing;

drop function if exists public.find_receiver_team_request(uuid, uuid);
create function public.find_receiver_team_request(
  sender_request uuid,
  receiver_profile uuid
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tr.id
  from public.team_requests sender_request_row
  join public.team_requests tr on tr.profile_id = receiver_profile
  where sender_request_row.id = sender_request
    and tr.status = 'looking'
    and public.requests_same_course_and_session(sender_request_row.id, tr.id)
    and public.get_request_remaining_spots(tr.id) > 0
  order by tr.created_at desc
  limit 1;
$$;

drop function if exists public.get_friend_match_options(uuid, uuid);
create function public.get_friend_match_options(connection_request uuid, current_profile uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with friend_connection as (
    select
      c.*,
      case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end as friend_profile
    from public.connections c
    where c.id = connection_request
      and c.status = 'accepted'
      and c.relationship_type = 'friend'
      and current_profile in (c.sender_profile_id, c.receiver_profile_id)
      and public.owns_profile(current_profile)
  ),
  pairs as (
    select
      my_request.id as current_request_id,
      friend_request.id as friend_request_id,
      my_request.course_name,
      my_request.course,
      my_request.course_code,
      my_request.class_day,
      my_request.class_start_time,
      my_request.class_end_time,
      my_request.class_session,
      (
        friend_request.id is not null
        or coalesce(friend_profile.skills, '{}'::text[]) && coalesce(my_request.skills_needed, '{}'::text[])
        or friend_profile.school = my_request.school
        or friend_profile.major = my_request.major
      ) as is_suitable
    from friend_connection fc
    join public.team_requests my_request on my_request.profile_id = current_profile
    join public.profiles friend_profile on friend_profile.id = fc.friend_profile
    left join lateral (
      select tr.id
      from public.team_requests tr
      where tr.profile_id = fc.friend_profile
        and tr.status = 'looking'
        and public.requests_same_course_and_session(my_request.id, tr.id)
        and public.get_request_remaining_spots(tr.id) > 0
      order by tr.created_at desc
      limit 1
    ) friend_request on true
    where my_request.status = 'looking'
      and public.get_request_remaining_spots(my_request.id) > 0
      and not exists (
        select 1
        from public.teammate_relationships rel
        where rel.status = 'active'
          and my_request.id in (rel.request_a_id, rel.request_b_id)
          and fc.friend_profile in (rel.profile_a_id, rel.profile_b_id)
      )
    order by is_suitable desc, my_request.created_at desc
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'current_request_id', current_request_id,
        'friend_request_id', friend_request_id,
        'course_name', coalesce(course_name, course),
        'course_code', course_code,
        'class_day', class_day,
        'class_start_time', to_char(class_start_time, 'HH24:MI'),
        'class_end_time', case when class_end_time is null then null else to_char(class_end_time, 'HH24:MI') end,
        'class_session', class_session,
        'is_suitable', is_suitable
      )
    ),
    '[]'::jsonb
  )
  from pairs;
$$;

drop function if exists public.confirm_friend_match(uuid, uuid, uuid, uuid);
create function public.confirm_friend_match(
  connection_request uuid,
  current_profile uuid,
  current_request uuid,
  friend_request uuid
)
returns table(
  id uuid,
  connection_id uuid,
  request_a_id uuid,
  request_b_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  connection_row public.connections;
  friend_profile uuid;
  created_relationship public.teammate_relationships;
begin
  select c.* into connection_row
  from public.connections c
  where c.id = connection_request
    and c.status = 'accepted'
    and c.relationship_type = 'friend'
    and current_profile in (c.sender_profile_id, c.receiver_profile_id);

  if connection_row.id is null then
    raise exception 'Accepted friend connection required.';
  end if;

  if not public.owns_profile(current_profile) then
    raise exception 'Profile ownership required.';
  end if;

  friend_profile := case
    when connection_row.sender_profile_id = current_profile then connection_row.receiver_profile_id
    else connection_row.sender_profile_id
  end;

  if not exists (
    select 1 from public.team_requests tr
    where tr.id = current_request
      and tr.profile_id = current_profile
      and tr.status = 'looking'
  ) then
    raise exception 'Your request is not active.';
  end if;

  if friend_request is not null then
    if not exists (
      select 1 from public.team_requests tr
      where tr.id = friend_request
        and tr.profile_id = friend_profile
        and tr.status = 'looking'
    ) then
      raise exception 'Friend request is not active.';
    end if;
  end if;

  if public.get_request_remaining_spots(current_request) <= 0 then
    raise exception 'Your team is already complete.';
  end if;

  if friend_request is not null and public.get_request_remaining_spots(friend_request) <= 0 then
    raise exception 'This friend has no open teammate spots.';
  end if;

  insert into public.teammate_relationships (
    connection_id,
    profile_a_id,
    profile_b_id,
    request_a_id,
    request_b_id,
    status
  )
  values (
    connection_request,
    current_profile,
    friend_profile,
    current_request,
    friend_request,
    'active'
  )
  on conflict do nothing;

  select rel.* into created_relationship
  from public.teammate_relationships rel
  where rel.status = 'active'
    and rel.request_a_id = current_request
    and friend_profile in (rel.profile_a_id, rel.profile_b_id)
  limit 1;

  perform public.create_notification(friend_profile, current_profile, 'teammate_matched', connection_request, null);

  return query select
    created_relationship.id,
    created_relationship.connection_id,
    created_relationship.request_a_id,
    created_relationship.request_b_id,
    created_relationship.status;
end;
$$;

drop function if exists public.list_friends(uuid);
create function public.list_friends(current_profile uuid)
returns table(
  connection_id uuid,
  teammate_profile_id uuid,
  teammate_full_name text,
  teammate_university text,
  teammate_school text,
  teammate_major text,
  teammate_skills text[],
  teammate_is_demo boolean,
  updated_at timestamptz,
  match_options jsonb
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
    c.updated_at,
    public.get_friend_match_options(c.id, current_profile) as match_options
  from public.connections c
  join public.profiles p
    on p.id = case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end
  where public.owns_profile(current_profile)
    and c.status = 'accepted'
    and c.relationship_type = 'friend'
    and current_profile in (c.sender_profile_id, c.receiver_profile_id)
  order by c.updated_at desc;
$$;

drop function if exists public.get_team_request_progress(uuid, uuid);
create function public.get_team_request_progress(
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
      case when rel.profile_a_id = current_profile then rel.profile_b_id else rel.profile_a_id end
    )
      case when rel.profile_a_id = current_profile then rel.profile_b_id else rel.profile_a_id end as teammate_profile_id,
      rel.connection_id,
      rel.created_at
    from public.teammate_relationships rel
    join allowed_request ar on ar.id in (rel.request_a_id, rel.request_b_id)
    where rel.status = 'active'
      and current_profile in (rel.profile_a_id, rel.profile_b_id)
    order by
      case when rel.profile_a_id = current_profile then rel.profile_b_id else rel.profile_a_id end,
      rel.created_at desc
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
        order by m.created_at desc
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

drop function if exists public.get_match_candidates_for_request(uuid, uuid);
create function public.get_match_candidates_for_request(requested_request uuid, current_profile uuid)
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
  with current_request as (
    select tr.*, p.university
    from public.team_requests tr
    join public.profiles p on p.id = tr.profile_id
    where tr.id = requested_request
      and tr.profile_id = current_profile
      and tr.status = 'looking'
      and public.owns_profile(current_profile)
  )
  select
    candidate.id,
    candidate.profile_id,
    candidate.school,
    candidate.major,
    candidate.course,
    candidate.course_name,
    candidate.course_code,
    candidate.class_session,
    candidate.skills_needed,
    candidate.members_needed,
    candidate.total_team_size,
    candidate.teammates_needed_initial,
    candidate.availability,
    candidate.preferred_active_time,
    candidate.work_style,
    candidate.work_styles,
    candidate.requirements,
    candidate.requirements_data,
    candidate.requires_portfolio,
    candidate.portfolio_reference_path,
    candidate.portfolio_reference_name,
    candidate.status,
    candidate.created_at,
    public.public_profile_json(p) as profile
  from current_request cr
  join public.team_requests candidate on candidate.status = 'looking'
  join public.profiles p on p.id = candidate.profile_id
  where candidate.id <> cr.id
    and candidate.profile_id <> cr.profile_id
    and coalesce(p.university, 'RMIT University') = coalesce(cr.university, 'RMIT University')
    and (p.is_demo = true or p.consent_public_visibility = true or p.owner_id = auth.uid())
    and (p.is_available = true or p.owner_id = auth.uid())
    and public.requests_same_course_and_session(cr.id, candidate.id)
    and public.get_request_remaining_spots(candidate.id) > 0
  order by candidate.created_at desc;
$$;

drop function if exists public.unmatch_connection_request(uuid, uuid, text, text);
create function public.unmatch_connection_request(
  connection_request uuid,
  current_profile uuid,
  reason text,
  note text
)
returns table(id uuid, status text, unmatched_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_connection public.connections;
  teammate uuid;
begin
  if not public.owns_profile(current_profile) then
    raise exception 'Profile ownership required.';
  end if;

  update public.connections c
  set
    status = 'unmatched',
    unmatched_by_profile_id = current_profile,
    unmatch_reason = reason,
    unmatch_note = nullif(trim(coalesce(note, '')), ''),
    unmatched_at = now(),
    updated_at = now()
  where c.id = connection_request
    and current_profile in (c.sender_profile_id, c.receiver_profile_id)
    and c.status = 'accepted'
  returning * into updated_connection;

  if updated_connection.id is null then
    return;
  end if;

  update public.teammate_relationships rel
  set status = 'ended',
      ended_at = now()
  where rel.connection_id = updated_connection.id
    and rel.status = 'active';

  teammate := case
    when updated_connection.sender_profile_id = current_profile then updated_connection.receiver_profile_id
    else updated_connection.sender_profile_id
  end;

  perform public.create_notification(teammate, current_profile, 'connection_unmatched', updated_connection.id, null);

  return query select updated_connection.id, updated_connection.status, updated_connection.unmatched_at;
end;
$$;

grant execute on function public.create_notification(uuid, uuid, text, uuid, uuid) to anon, authenticated;
grant execute on function public.request_course_key(uuid) to anon, authenticated;
grant execute on function public.requests_same_course_and_session(uuid, uuid) to anon, authenticated;
grant execute on function public.get_request_matched_teammate_count(uuid) to anon, authenticated;
grant execute on function public.get_request_remaining_spots(uuid) to anon, authenticated;
grant execute on function public.find_receiver_team_request(uuid, uuid) to anon, authenticated;
grant execute on function public.get_friend_match_options(uuid, uuid) to anon, authenticated;
grant execute on function public.confirm_friend_match(uuid, uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.list_friends(uuid) to anon, authenticated;
grant execute on function public.get_team_request_progress(uuid, uuid) to anon, authenticated;
grant execute on function public.get_match_candidates_for_request(uuid, uuid) to anon, authenticated;
grant execute on function public.unmatch_connection_request(uuid, uuid, text, text) to anon, authenticated;
