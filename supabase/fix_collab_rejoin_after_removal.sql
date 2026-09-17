-- Teamergency: reopen a Collab request after a member leaves or is removed.
--
-- Run manually in Supabase SQL Editor after review.
-- Do not execute this file from the application.
-- Requires the team_request_memberships migration and its helper functions.

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

-- Keep the exact current RPC contract while ensuring a removed member does
-- not leave the request closed when a real spot is available again.
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

revoke all on function public.reopen_team_request_after_membership_change(uuid) from public, anon, authenticated;
revoke all on function public.remove_team_request_member(uuid, uuid, uuid) from public, anon;
revoke all on function public.leave_team_request(uuid, uuid) from public, anon;
grant execute on function public.remove_team_request_member(uuid, uuid, uuid) to authenticated;
grant execute on function public.leave_team_request(uuid, uuid) to authenticated;
