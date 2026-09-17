-- Teamergency: independent project membership management.
--
-- Run manually in the Supabase SQL Editor after review.
-- This migration is intentionally NOT executed by the app or local tooling.
-- Project membership is kept separate from Friend/Connection records so that
-- remove/leave/re-apply changes only one project.

create table if not exists public.team_request_memberships (
  id uuid primary key default gen_random_uuid(),
  team_request_id uuid not null references public.team_requests(id) on delete cascade,
  member_profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_via_connection_id uuid references public.connections(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_request_id, member_profile_id)
);

create index if not exists team_request_memberships_request_idx
  on public.team_request_memberships(team_request_id, created_at);

create index if not exists team_request_memberships_member_idx
  on public.team_request_memberships(member_profile_id, created_at);

alter table public.team_request_memberships enable row level security;
revoke all on public.team_request_memberships from public, anon, authenticated;

-- The old pair-only index prevented an existing Friend connection and a
-- project-specific join connection from coexisting. Keep one active Discover
-- relationship per pair, but scope team-request connections to their request.
drop index if exists public.connections_active_pair_unique_idx;

create unique index if not exists connections_active_discover_pair_unique_idx
on public.connections (
  least(sender_profile_id, receiver_profile_id),
  greatest(sender_profile_id, receiver_profile_id)
)
where status in ('pending', 'accepted')
  and connection_context = 'discover';

create unique index if not exists connections_active_team_request_unique_idx
on public.connections (
  least(sender_profile_id, receiver_profile_id),
  greatest(sender_profile_id, receiver_profile_id),
  coalesce(sender_team_request_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(receiver_team_request_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
where status in ('pending', 'accepted')
  and connection_context = 'team_request';

-- Backfill accepted project members from both legacy sources: the request-
-- linked relationship graph and accepted team-request connections. Owners are
-- implicit and are not duplicated in this table.
insert into public.team_request_memberships (
  team_request_id,
  member_profile_id,
  joined_via_connection_id,
  created_at,
  updated_at
)
with legacy_memberships as (
  select
    rel.request_a_id as team_request_id,
    case when rel.profile_a_id = tr.profile_id then rel.profile_b_id else rel.profile_a_id end as member_profile_id,
    tr.profile_id as owner_profile_id,
    rel.connection_id,
    rel.created_at
  from public.teammate_relationships rel
  join public.team_requests tr on tr.id = rel.request_a_id
  join public.connections c on c.id = rel.connection_id
  where rel.status = 'active'
    and c.status = 'accepted'
    and c.connection_context = 'team_request'
    and c.relationship_type = 'teammate'
    and rel.request_a_id is not null
    and rel.request_a_id in (c.sender_team_request_id, c.receiver_team_request_id)
    and tr.profile_id in (rel.profile_a_id, rel.profile_b_id)

  union all

  select
    rel.request_b_id as team_request_id,
    case when rel.profile_a_id = tr.profile_id then rel.profile_b_id else rel.profile_a_id end as member_profile_id,
    tr.profile_id as owner_profile_id,
    rel.connection_id,
    rel.created_at
  from public.teammate_relationships rel
  join public.team_requests tr on tr.id = rel.request_b_id
  join public.connections c on c.id = rel.connection_id
  where rel.status = 'active'
    and c.status = 'accepted'
    and c.connection_context = 'team_request'
    and c.relationship_type = 'teammate'
    and rel.request_b_id is not null
    and rel.request_b_id in (c.sender_team_request_id, c.receiver_team_request_id)
    and tr.profile_id in (rel.profile_a_id, rel.profile_b_id)

  union all

  select
    c.receiver_team_request_id as team_request_id,
    c.sender_profile_id as member_profile_id,
    tr.profile_id as owner_profile_id,
    c.id as connection_id,
    coalesce(c.accepted_at, c.updated_at, c.created_at) as created_at
  from public.connections c
  join public.team_requests tr on tr.id = c.receiver_team_request_id
  where c.status = 'accepted'
    and c.connection_context = 'team_request'
    and c.relationship_type = 'teammate'
    and c.receiver_team_request_id is not null
    and tr.profile_id = c.receiver_profile_id
    and c.sender_profile_id <> tr.profile_id

  union all

  select
    c.sender_team_request_id as team_request_id,
    c.receiver_profile_id as member_profile_id,
    tr.profile_id as owner_profile_id,
    c.id as connection_id,
    coalesce(c.accepted_at, c.updated_at, c.created_at) as created_at
  from public.connections c
  join public.team_requests tr on tr.id = c.sender_team_request_id
  where c.status = 'accepted'
    and c.connection_context = 'team_request'
    and c.relationship_type = 'teammate'
    and c.sender_team_request_id is not null
    and tr.profile_id = c.sender_profile_id
    and c.receiver_profile_id <> tr.profile_id
), deduplicated as (
  select distinct on (team_request_id, member_profile_id)
    team_request_id,
    member_profile_id,
    connection_id,
    created_at
  from legacy_memberships
  where member_profile_id is not null
    and member_profile_id <> owner_profile_id
  order by team_request_id, member_profile_id, created_at, connection_id
)
select
  team_request_id,
  member_profile_id,
  connection_id,
  created_at,
  created_at
from deduplicated
on conflict (team_request_id, member_profile_id) do nothing;

create or replace function public.sync_team_request_membership_from_connection()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.status = 'accepted' and new.connection_context = 'team_request' then
    if new.receiver_team_request_id is not null then
      insert into public.team_request_memberships (
        team_request_id,
        member_profile_id,
        joined_via_connection_id
      )
      select new.receiver_team_request_id, new.sender_profile_id, new.id
      where new.sender_profile_id <> new.receiver_profile_id
      on conflict (team_request_id, member_profile_id)
      do update set
        joined_via_connection_id = excluded.joined_via_connection_id,
        updated_at = now();
    end if;

    if new.sender_team_request_id is not null then
      insert into public.team_request_memberships (
        team_request_id,
        member_profile_id,
        joined_via_connection_id
      )
      select new.sender_team_request_id, new.receiver_profile_id, new.id
      where new.sender_profile_id <> new.receiver_profile_id
      on conflict (team_request_id, member_profile_id)
      do update set
        joined_via_connection_id = excluded.joined_via_connection_id,
        updated_at = now();
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists sync_team_request_membership_trigger on public.connections;
create trigger sync_team_request_membership_trigger
after insert or update of status, connection_context, sender_team_request_id, receiver_team_request_id
on public.connections
for each row
execute function public.sync_team_request_membership_from_connection();

create or replace function public.request_team_status_json_v2(request_row public.team_requests)
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
with totals as (
  select
    greatest(
      1,
      coalesce(
        request_row.baseline_member_count,
        coalesce(request_row.total_team_size, request_row.members_needed + 1, 2)
          - coalesce(request_row.teammates_needed_initial, request_row.members_needed, 1),
        1
      )
    )::integer as baseline_members,
    coalesce(request_row.total_team_size, request_row.members_needed + 1, 2)::integer as total_members,
    count(tm.id)::integer as joined_members
  from public.team_request_memberships tm
  where tm.team_request_id = request_row.id
)
select jsonb_build_object(
  'remaining_members', greatest(0, totals.total_members - least(totals.total_members, totals.baseline_members + totals.joined_members)),
  'current_members', least(totals.total_members, totals.baseline_members + totals.joined_members),
  'required_members', totals.total_members,
  'status', case
    when totals.baseline_members + totals.joined_members >= totals.total_members then 'complete'
    else 'forming'
  end,
  'status_label', case
    when totals.baseline_members + totals.joined_members >= totals.total_members then 'Team complete'
    else 'Looking for ' || greatest(0, totals.total_members - least(totals.total_members, totals.baseline_members + totals.joined_members)) || ' teammate(s)'
  end
)
from totals;
$function$;

create or replace function public.get_team_request_members(
  target_request uuid,
  current_profile uuid
)
returns table(
  profile_id uuid,
  full_name text,
  major text,
  is_demo boolean,
  connection_id uuid,
  active_request_id uuid,
  is_owner boolean
)
language sql
security definer
stable
set search_path = public
as $function$
with target as (
  select tr.*
  from public.team_requests tr
  where tr.id = target_request
), access_check as (
  select 1
  from target tr
  where public.owns_profile(current_profile)
    and (
      tr.profile_id = current_profile
      or exists (
        select 1
        from public.team_request_memberships tm
        where tm.team_request_id = tr.id
          and tm.member_profile_id = current_profile
      )
      or (
        tr.status = 'looking'
        and exists (
          select 1
          from public.profiles owner_profile
          where owner_profile.id = tr.profile_id
            and (owner_profile.is_demo = true or owner_profile.consent_public_visibility = true or owner_profile.owner_id = auth.uid())
        )
      )
    )
), member_rows (
  profile_id,
  full_name,
  major,
  is_demo,
  connection_id,
  active_request_id,
  is_owner
) as (
  select
    owner_profile.id as profile_id,
    owner_profile.full_name as full_name,
    owner_profile.major as major,
    owner_profile.is_demo as is_demo,
    null::uuid as connection_id,
    null::uuid as active_request_id,
    true as is_owner
  from target tr
  join access_check on true
  join public.profiles owner_profile on owner_profile.id = tr.profile_id
  union all
  select
    member_profile.id as profile_id,
    member_profile.full_name as full_name,
    member_profile.major as major,
    member_profile.is_demo as is_demo,
    tm.joined_via_connection_id as connection_id,
    active_request.id as active_request_id,
    false as is_owner
  from target tr
  join access_check on true
  join public.team_request_memberships tm on tm.team_request_id = tr.id
  join public.profiles member_profile on member_profile.id = tm.member_profile_id
  left join lateral (
    select request.id
    from public.team_requests request
    where request.profile_id = member_profile.id
      and request.status = 'looking'
    order by request.created_at desc, request.id
    limit 1
  ) active_request on true
)
select
  member_rows.profile_id,
  member_rows.full_name,
  member_rows.major,
  member_rows.is_demo,
  member_rows.connection_id,
  member_rows.active_request_id,
  member_rows.is_owner
from member_rows
order by member_rows.is_owner desc, member_rows.full_name, member_rows.profile_id;
$function$;

create or replace function public.get_joined_team_requests(current_profile uuid)
returns table(
  id uuid,
  profile_id uuid,
  class_id uuid,
  school text,
  major text,
  course text,
  course_name text,
  course_code text,
  class_session text,
  request_scope text,
  opportunity_type text,
  opportunity_field text,
  opportunity_name text,
  deadline date,
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
  pinned_until timestamptz,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  profile jsonb,
  team_status jsonb
)
language sql
security definer
stable
set search_path = public
as $function$
select distinct on (tr.id)
  tr.id,
  tr.profile_id,
  tr.class_id,
  tr.school,
  tr.major,
  tr.course,
  tr.course_name,
  tr.course_code,
  tr.class_session,
  tr.request_scope,
  tr.opportunity_type,
  tr.opportunity_field,
  tr.opportunity_name,
  tr.deadline,
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
  tr.pinned_until,
  tr.status,
  tr.created_at,
  tr.updated_at,
  public.public_profile_json(owner_profile) as profile,
  public.request_team_status_json_v2(tr) as team_status
from public.team_request_memberships tm
join public.team_requests tr on tr.id = tm.team_request_id
join public.profiles owner_profile on owner_profile.id = tr.profile_id
where tm.member_profile_id = current_profile
  and public.owns_profile(current_profile)
order by tr.id, tm.updated_at desc;
$function$;

-- Historical progress RPCs used a shorter two-column RETURNS TABLE contract.
-- Drop the identity before installing the current six-column contract so this
-- migration can recover from a partially upgraded database without CASCADE.
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
stable
set search_path = public
as $function$
with target as (
  select
    tr.*,
    greatest(
      1,
      coalesce(
        tr.baseline_member_count,
        coalesce(tr.total_team_size, tr.members_needed + 1, 2)
          - coalesce(tr.teammates_needed_initial, tr.members_needed, 1),
        1
      )
    )::integer as baseline_members
  from public.team_requests tr
  where tr.id = request_id
), accessible as (
  select target.*
  from target
  where public.owns_profile(current_profile)
    and (
      target.profile_id = current_profile
      or target.status = 'looking'
      or exists (
        select 1
        from public.team_request_memberships tm
        where tm.team_request_id = target.id
          and tm.member_profile_id = current_profile
      )
    )
), member_rows as (
  select
    tm.member_profile_id,
    tm.joined_via_connection_id as connection_id,
    tm.updated_at,
    member_profile.full_name,
    member_profile.major,
    member_profile.is_demo,
    active_request.id as active_request_id
  from accessible target
  join public.team_request_memberships tm on tm.team_request_id = target.id
  join public.profiles member_profile on member_profile.id = tm.member_profile_id
  left join lateral (
    select request.id
    from public.team_requests request
    where request.profile_id = member_profile.id
      and request.status = 'looking'
    order by request.created_at desc, request.id
    limit 1
  ) active_request on true
), totals as (
  select
    accessible.baseline_members,
    coalesce(accessible.total_team_size, accessible.members_needed + 1, 2)::integer as total_team_size,
    count(member_rows.member_profile_id)::integer as matched_count
  from accessible
  left join member_rows on true
  group by accessible.baseline_members, accessible.total_team_size, accessible.members_needed
)
select
  least(totals.total_team_size, totals.baseline_members + totals.matched_count)::integer,
  totals.matched_count,
  totals.baseline_members,
  totals.total_team_size,
  greatest(0, totals.total_team_size - least(totals.total_team_size, totals.baseline_members + totals.matched_count))::integer,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'profile_id', member_rows.member_profile_id,
      'full_name', member_rows.full_name,
      'major', member_rows.major,
      'is_demo', member_rows.is_demo,
      'connection_id', member_rows.connection_id,
      'active_request_id', member_rows.active_request_id
    ) order by member_rows.updated_at desc, member_rows.member_profile_id)
    from member_rows
  ), '[]'::jsonb)
from totals;
$function$;

create or replace function public.request_to_join_team_request(
  target_request uuid,
  joining_profile uuid,
  intro_message text
)
returns table(id uuid, status text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_row public.team_requests;
  existing_connection public.connections;
  current_members integer;
  total_members integer;
begin
  if not public.owns_profile(joining_profile) then
    raise exception 'Joining profile ownership required.';
  end if;

  select tr.* into target_row
  from public.team_requests tr
  where tr.id = target_request
    and tr.status = 'looking'
    and tr.profile_id <> joining_profile
    and tr.class_id is null
    and (tr.request_scope = 'open_opportunity' or tr.opportunity_name is not null)
  for update;

  if target_row.id is null then
    raise exception 'Open Collab request not found.';
  end if;

  if exists (
    select 1 from public.team_request_memberships tm
    where tm.team_request_id = target_request
      and tm.member_profile_id = joining_profile
  ) then
    return query select null::uuid, 'accepted';
    return;
  end if;

  total_members := coalesce(target_row.total_team_size, target_row.members_needed + 1, 2);
  select greatest(
    1,
    coalesce(
      target_row.baseline_member_count,
      total_members - coalesce(target_row.teammates_needed_initial, target_row.members_needed, 1),
      1
    )
    + count(tm.id)
  ) into current_members
  from public.team_request_memberships tm
  where tm.team_request_id = target_request;

  if current_members >= total_members then
    raise exception 'Team is already full.';
  end if;

  select c.* into existing_connection
  from public.connections c
  where c.sender_profile_id = joining_profile
    and c.receiver_profile_id = target_row.profile_id
    and c.receiver_team_request_id = target_request
    and c.sender_team_request_id is null
    and c.connection_context = 'team_request'
  order by c.updated_at desc, c.created_at desc
  limit 1;

  if existing_connection.id is not null then
    if existing_connection.status = 'pending' then
      return query select existing_connection.id, existing_connection.status;
      return;
    end if;

    if existing_connection.status = 'accepted' then
      update public.connections
      set status = 'pending',
          accepted_at = null,
          intro_message = nullif(trim(coalesce(intro_message, '')), ''),
          updated_at = now()
      where id = existing_connection.id
      returning * into existing_connection;

      perform public.create_notification(
        target_row.profile_id,
        joining_profile,
        'connection_request',
        existing_connection.id,
        null
      );

      return query select existing_connection.id, existing_connection.status;
      return;
    end if;
  end if;

  insert into public.connections (
    sender_profile_id,
    receiver_profile_id,
    sender_team_request_id,
    receiver_team_request_id,
    connection_context,
    relationship_type,
    intro_message,
    status
  ) values (
    joining_profile,
    target_row.profile_id,
    null,
    target_request,
    'team_request',
    'teammate',
    nullif(trim(coalesce(intro_message, '')), ''),
    'pending'
  ) returning * into existing_connection;

  perform public.create_notification(
    target_row.profile_id,
    joining_profile,
    'connection_request',
    existing_connection.id,
    null
  );

  return query select existing_connection.id, existing_connection.status;
end;
$function$;

create or replace function public.get_team_request_join_state(
  target_request uuid,
  joining_profile uuid
)
returns table(id uuid, status text, connection_context text, relationship_type text)
language sql
security definer
stable
set search_path = public
as $function$
with states as (
  select tm.id, 'accepted'::text as status, 'team_request'::text as connection_context, 'teammate'::text as relationship_type, 1 as priority
  from public.team_request_memberships tm
  where tm.team_request_id = target_request
    and tm.member_profile_id = joining_profile
    and public.owns_profile(joining_profile)
  union all
  select c.id, c.status, c.connection_context, c.relationship_type, 2 as priority
  from public.connections c
  where c.sender_profile_id = joining_profile
    and c.sender_team_request_id is null
    and c.receiver_team_request_id = target_request
    and c.connection_context = 'team_request'
    and c.status = 'pending'
    and public.owns_profile(joining_profile)
)
select id, status, connection_context, relationship_type
from states
order by priority
limit 1;
$function$;

-- Detach one request from the legacy relationship representation without
-- ending a relationship that still represents another request. The table
-- requires request_a_id and allows request_b_id to be null, so the surviving
-- request is kept in request_a_id when both references are present.
create or replace function public.detach_team_request_legacy_relationship(
  target_request uuid,
  member_profile uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  legacy_row record;
  surviving_request uuid;
  duplicate_survivor boolean;
begin
  for legacy_row in
    select rel.*
    from public.teammate_relationships rel
    where rel.status = 'active'
      and (rel.request_a_id = target_request or rel.request_b_id = target_request)
      and member_profile in (rel.profile_a_id, rel.profile_b_id)
    for update
  loop
    if legacy_row.request_b_id = target_request then
      surviving_request := legacy_row.request_a_id;
    elsif legacy_row.request_a_id = target_request and legacy_row.request_b_id is not null then
      surviving_request := legacy_row.request_b_id;
    else
      surviving_request := null;
    end if;

    if surviving_request is null then
      update public.teammate_relationships rel
      set status = 'ended',
          ended_at = coalesce(rel.ended_at, now())
      where rel.id = legacy_row.id;
      continue;
    end if;

    select exists (
      select 1
      from public.teammate_relationships other_rel
      where other_rel.id <> legacy_row.id
        and other_rel.status = 'active'
        and other_rel.request_a_id = surviving_request
        and least(other_rel.profile_a_id::text, other_rel.profile_b_id::text)
          = least(legacy_row.profile_a_id::text, legacy_row.profile_b_id::text)
        and greatest(other_rel.profile_a_id::text, other_rel.profile_b_id::text)
          = greatest(legacy_row.profile_a_id::text, legacy_row.profile_b_id::text)
    ) into duplicate_survivor;

    if duplicate_survivor then
      -- Another active legacy row already represents the surviving request.
      -- Ending this duplicate preserves that other request association.
      update public.teammate_relationships rel
      set status = 'ended',
          ended_at = coalesce(rel.ended_at, now())
      where rel.id = legacy_row.id;
    elsif legacy_row.request_b_id = target_request then
      update public.teammate_relationships rel
      set request_b_id = null
      where rel.id = legacy_row.id;
    else
      update public.teammate_relationships rel
      set request_a_id = surviving_request,
          request_b_id = null
      where rel.id = legacy_row.id;
    end if;
  end loop;
end;
$function$;

-- PostgreSQL cannot replace a function when its OUT-parameter row type has
-- changed. The production database may still contain an older contract, so
-- drop only this exact overload before recreating the current one.
drop function if exists public.remove_team_request_member(uuid, uuid, uuid);
create function public.remove_team_request_member(
  target_request uuid,
  owner_profile uuid,
  member_profile uuid
)
returns table(team_request_id uuid, removed_profile_id uuid)
language plpgsql
security definer
set search_path = public
as $function$
declare
  removed_membership boolean := false;
begin
  if not public.owns_profile(owner_profile) then
    raise exception 'Owner profile ownership required.';
  end if;

  if not exists (
    select 1 from public.team_requests tr
    where tr.id = target_request
      and tr.profile_id = owner_profile
  ) then
    raise exception 'Only the project owner can remove members.';
  end if;

  if member_profile = owner_profile then
    raise exception 'The project owner cannot be removed.';
  end if;

  delete from public.team_request_memberships tm
  where tm.team_request_id = target_request
    and tm.member_profile_id = member_profile;

  removed_membership := found;

  perform public.detach_team_request_legacy_relationship(target_request, member_profile);

  if not removed_membership then return; end if;
  return query select target_request, member_profile;
end;
$function$;

create or replace function public.leave_team_request(
  target_request uuid,
  member_profile uuid
)
returns table(team_request_id uuid, removed_profile_id uuid)
language plpgsql
security definer
set search_path = public
as $function$
declare
  removed_membership boolean := false;
begin
  if not public.owns_profile(member_profile) then
    raise exception 'Member profile ownership required.';
  end if;

  if exists (
    select 1 from public.team_requests tr
    where tr.id = target_request
      and tr.profile_id = member_profile
  ) then
    raise exception 'The project owner cannot leave their own request.';
  end if;

  if not exists (
    select 1
    from public.team_request_memberships tm
    where tm.team_request_id = target_request
      and tm.member_profile_id = member_profile
  ) then
    return;
  end if;

  delete from public.team_request_memberships tm
  where tm.team_request_id = target_request
    and tm.member_profile_id = member_profile;

  removed_membership := found;

  perform public.detach_team_request_legacy_relationship(target_request, member_profile);

  if not removed_membership then return; end if;
  return query select target_request, member_profile;
end;
$function$;

revoke all on function public.get_team_request_members(uuid, uuid) from public, anon;
revoke all on function public.get_joined_team_requests(uuid) from public, anon;
revoke all on function public.detach_team_request_legacy_relationship(uuid, uuid) from public, anon, authenticated;
revoke all on function public.remove_team_request_member(uuid, uuid, uuid) from public, anon;
revoke all on function public.leave_team_request(uuid, uuid) from public, anon;
revoke all on function public.request_to_join_team_request(uuid, uuid, text) from public, anon;
revoke all on function public.get_team_request_join_state(uuid, uuid) from public, anon;
revoke all on function public.get_team_request_progress(uuid, uuid) from public, anon;
grant execute on function public.get_team_request_members(uuid, uuid) to authenticated;
grant execute on function public.get_joined_team_requests(uuid) to authenticated;
grant execute on function public.remove_team_request_member(uuid, uuid, uuid) to authenticated;
grant execute on function public.leave_team_request(uuid, uuid) to authenticated;
grant execute on function public.request_to_join_team_request(uuid, uuid, text) to authenticated;
grant execute on function public.get_team_request_join_state(uuid, uuid) to authenticated;
grant execute on function public.get_team_request_progress(uuid, uuid) to authenticated;
