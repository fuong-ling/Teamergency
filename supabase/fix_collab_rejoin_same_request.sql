-- Teamergency: allow a user to rejoin the same Collab request after leaving
-- or being removed.
--
-- Run manually in Supabase SQL Editor after review.
-- Do not execute this file from the application.
-- Requires public.team_request_memberships and the membership migration's
-- legacy-detach helper to already exist.
--
-- Current state is authoritative:
--   active membership                 -> Joined
--   pending request for this project  -> Request Sent
--   neither, with capacity/open state -> Request to Join
-- Historical accepted/declined rows and ended legacy relationships do not
-- permanently block a new request.

-- Keep legacy teammate_relationships synchronized for only the request being
-- changed. If the same legacy row also represents another request, preserve
-- that surviving request association instead of ending the whole row.
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

-- Reopen a request when a real member leaves or is removed. The owner/baseline
-- member remains implicit; only active rows in team_request_memberships are
-- counted as additional members.
create or replace function public.reopen_team_request_after_membership_change(
  target_request uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  request_row public.team_requests;
  baseline_members integer;
  total_members integer;
  active_members integer;
begin
  select tr.*
  into request_row
  from public.team_requests tr
  where tr.id = target_request
  for update;

  if request_row.id is null or request_row.status <> 'found' then
    return;
  end if;

  baseline_members := greatest(
    1,
    coalesce(
      request_row.baseline_member_count,
      coalesce(request_row.total_team_size, request_row.members_needed + 1, 2)
        - coalesce(request_row.teammates_needed_initial, request_row.members_needed, 1),
      1
    )
  );
  total_members := coalesce(request_row.total_team_size, request_row.members_needed + 1, 2);

  select count(*)::integer
  into active_members
  from public.team_request_memberships tm
  where tm.team_request_id = target_request;

  if baseline_members + active_members < total_members then
    update public.team_requests tr
    set status = 'looking',
        updated_at = now()
    where tr.id = target_request
      and tr.status = 'found';
  end if;
end;
$function$;

-- Recreate this exact overload because older deployments may have a different
-- OUT row type. No CASCADE is used, so unrelated objects are not removed.
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
    select 1
    from public.team_requests tr
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

  if not removed_membership then
    return;
  end if;

  perform public.detach_team_request_legacy_relationship(target_request, member_profile);
  perform public.reopen_team_request_after_membership_change(target_request);

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
    select 1
    from public.team_requests tr
    where tr.id = target_request
      and tr.profile_id = member_profile
  ) then
    raise exception 'The project owner cannot leave their own request.';
  end if;

  -- Do not detach legacy history unless an active membership for this exact
  -- project was present. This keeps a stale row from affecting other work.
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

  if not removed_membership then
    return;
  end if;

  perform public.detach_team_request_legacy_relationship(target_request, member_profile);
  perform public.reopen_team_request_after_membership_change(target_request);

  return query select target_request, member_profile;
end;
$function$;

-- Replace the join RPC with current-state-only eligibility. This is
-- role-agnostic and applies equally to students, lecturers, and participants.
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
  if not public.owns_profile($2) then
    raise exception 'Joining profile ownership required.';
  end if;

  select tr.*
  into target_row
  from public.team_requests tr
  where tr.id = $1
    and tr.status = 'looking'
    and tr.profile_id <> $2
    and tr.class_id is null
    and (tr.request_scope = 'open_opportunity' or tr.opportunity_name is not null)
  for update;

  if target_row.id is null then
    raise exception 'Open Collab request not found.';
  end if;

  -- Membership is the only current Joined state. Historical connection or
  -- teammate_relationships rows are not consulted here.
  if exists (
    select 1
    from public.team_request_memberships tm
    where tm.team_request_id = $1
      and tm.member_profile_id = $2
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
    ) + count(tm.id)
  )
  into current_members
  from public.team_request_memberships tm
  where tm.team_request_id = $1;

  if current_members >= total_members then
    raise exception 'Team is already full.';
  end if;

  -- Only a current pending request blocks a new request. An accepted row is
  -- historical once its membership is gone, so it is reset to pending and can
  -- represent a fresh application for this same project.
  select c.*
  into existing_connection
  from public.connections c
  where c.sender_profile_id = $2
    and c.receiver_profile_id = target_row.profile_id
    and c.sender_team_request_id is null
    and c.receiver_team_request_id = $1
    and c.connection_context = 'team_request'
    and c.status in ('pending', 'accepted')
  order by c.updated_at desc nulls last, c.created_at desc, c.id
  limit 1;

  if existing_connection.id is not null then
    if existing_connection.status = 'pending' then
      return query select existing_connection.id, existing_connection.status;
      return;
    end if;

    update public.connections c
    set status = 'pending',
        accepted_at = null,
        intro_message = nullif(trim(coalesce($3, '')), ''),
        updated_at = now()
    where c.id = existing_connection.id
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

  insert into public.connections (
    sender_profile_id,
    receiver_profile_id,
    sender_team_request_id,
    receiver_team_request_id,
    connection_context,
    relationship_type,
    intro_message,
    status
  )
  values (
    $2,
    target_row.profile_id,
    null,
    $1,
    'team_request',
    'teammate',
    nullif(trim(coalesce($3, '')), ''),
    'pending'
  )
  returning * into existing_connection;

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

-- Read state follows the same current-only rule. In particular, an old
-- accepted connection alone is not returned as Joined or Request Sent.
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
  select
    tm.id,
    'accepted'::text as status,
    'team_request'::text as connection_context,
    'teammate'::text as relationship_type,
    1 as priority
  from public.team_request_memberships tm
  where tm.team_request_id = target_request
    and tm.member_profile_id = joining_profile
    and public.owns_profile(joining_profile)

  union all

  select
    c.id,
    c.status,
    c.connection_context,
    c.relationship_type,
    2 as priority
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

revoke all on function public.detach_team_request_legacy_relationship(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reopen_team_request_after_membership_change(uuid) from public, anon, authenticated;
revoke all on function public.remove_team_request_member(uuid, uuid, uuid) from public, anon;
revoke all on function public.leave_team_request(uuid, uuid) from public, anon;
revoke all on function public.request_to_join_team_request(uuid, uuid, text) from public, anon;
revoke all on function public.get_team_request_join_state(uuid, uuid) from public, anon;

grant execute on function public.remove_team_request_member(uuid, uuid, uuid) to authenticated;
grant execute on function public.leave_team_request(uuid, uuid) to authenticated;
grant execute on function public.request_to_join_team_request(uuid, uuid, text) to authenticated;
grant execute on function public.get_team_request_join_state(uuid, uuid) to authenticated;
