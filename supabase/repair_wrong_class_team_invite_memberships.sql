-- Teamergency: repair one proven historical class-team invite reversal.
--
-- MANUAL SUPABASE EXECUTION ONLY. Do not run from the application.
-- Run the read-only diagnostic first, then replace v_invite_id with the
-- specific accepted invite that the diagnostic proves was reversed.
--
-- This script is intentionally fail-closed:
-- * NULL invite id aborts before any mutation.
-- * exactly one invitee-owned request must contain the reversed row.
-- * that old request must contain only that one member, so other teammates
--   cannot be detached accidentally.
-- * no CASCADE is used, and friendships/connections are not touched.

do $function$
declare
  v_invite_id uuid := null;
  v_invite public.class_team_invites;
  v_target public.team_requests;
  v_old_request public.team_requests;
  v_old_request_count integer;
  v_old_member_count integer;
  v_target_member_count integer;
  v_target_total_size integer;
begin
  if v_invite_id is null then
    raise exception 'Set v_invite_id to one proven reversed accepted invite before running this repair.';
  end if;

  select i.*
  into v_invite
  from public.class_team_invites i
  where i.id = v_invite_id
    and i.status = 'accepted'
  for update;

  if v_invite.id is null then
    raise exception 'Accepted class-team invite % was not found.', v_invite_id;
  end if;

  select tr.*
  into v_target
  from public.team_requests tr
  where tr.id = v_invite.team_request_id
    and tr.class_id = v_invite.class_id
    and tr.profile_id = v_invite.inviter_profile_id
  for update;

  if v_target.id is null then
    raise exception 'The invite target request is missing or is not owned by the inviter.';
  end if;

  select count(*)::integer
  into v_old_request_count
  from public.team_requests old_request
  where old_request.profile_id = v_invite.invitee_profile_id
    and old_request.id <> v_invite.team_request_id
    and old_request.class_id = v_invite.class_id
    and old_request.class_session is not distinct from v_target.class_session
    and exists (
      select 1
      from public.class_team_memberships wrong_membership
      where wrong_membership.team_request_id = old_request.id
        and wrong_membership.profile_id = v_invite.inviter_profile_id
    );

  if v_old_request_count <> 1 then
    raise exception
      'Expected exactly one invitee-owned request with the proven reversed membership; found %.',
      v_old_request_count;
  end if;

  select old_request.*
  into v_old_request
  from public.team_requests old_request
  where old_request.profile_id = v_invite.invitee_profile_id
    and old_request.id <> v_invite.team_request_id
    and old_request.class_id = v_invite.class_id
    and old_request.class_session is not distinct from v_target.class_session
    and exists (
      select 1
      from public.class_team_memberships wrong_membership
      where wrong_membership.team_request_id = old_request.id
        and wrong_membership.profile_id = v_invite.inviter_profile_id
    )
  for update;

  select count(*)::integer
  into v_old_member_count
  from public.class_team_memberships old_membership
  where old_membership.team_request_id = v_old_request.id;

  if v_old_member_count <> 1 then
    raise exception
      'The suspected old request has % membership rows; refusing to detach a request with other members.',
      v_old_member_count;
  end if;

  if not exists (
    select 1
    from public.class_team_memberships wrong_membership
    where wrong_membership.team_request_id = v_old_request.id
      and wrong_membership.profile_id = v_invite.inviter_profile_id
  ) then
    raise exception 'The proven reversed membership row no longer exists.';
  end if;

  -- Restore the invitee on the inviter's explicit target request. The unique
  -- key makes this safe if a correct row was already restored manually.
  insert into public.class_team_memberships (class_id, team_request_id, profile_id)
  values (v_invite.class_id, v_invite.team_request_id, v_invite.invitee_profile_id)
  on conflict (team_request_id, profile_id) do nothing;

  -- Remove only the reversed membership row. No connection or friendship row
  -- is changed.
  delete from public.class_team_memberships wrong_membership
  where wrong_membership.team_request_id = v_old_request.id
    and wrong_membership.profile_id = v_invite.inviter_profile_id;

  -- The old owner request is now empty. 'found' is the existing terminal
  -- request state in this schema; no new status value is invented here.
  update public.team_requests old_request
  set status = 'found',
      updated_at = now()
  where old_request.id = v_old_request.id
    and old_request.status = 'looking';

  select count(*)::integer
  into v_target_member_count
  from public.class_team_memberships target_membership
  where target_membership.team_request_id = v_target.id;

  v_target_total_size := greatest(
    coalesce(v_target.total_team_size, v_target.members_needed + 1),
    1
  );

  if v_target_member_count > v_target_total_size then
    raise exception
      'Target request would exceed its configured team size (% > %); refusing to continue.',
      v_target_member_count,
      v_target_total_size;
  end if;

  if v_target_member_count >= v_target_total_size then
    update public.team_requests target_request
    set status = 'found',
        updated_at = now()
    where target_request.id = v_target.id
      and target_request.status = 'looking';
  end if;
end;
$function$;
