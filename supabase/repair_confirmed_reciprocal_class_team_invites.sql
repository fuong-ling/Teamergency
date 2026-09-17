-- Teamergency: repair one confirmed reciprocal class-team invite state.
--
-- MANUAL SUPABASE SQL EDITOR EXECUTION ONLY. Do not run from the application.
-- This migration is intentionally scoped to the confirmed production IDs from
-- the class/session diagnostic. It is fail-closed and safe to rerun.
--
-- The reciprocal accepted invite is preserved as historical audit data. The
-- current team is determined only by class_team_memberships, and pending
-- invites are the only invite rows surfaced by the current invite RPC.
-- No friendship/connection rows are changed. No cascading operations are used.

do $repair$
declare
  v_class_id uuid := '5a454520-62b9-4104-8957-29a5895b5041';
  v_class_session text := 'Session 02';
  v_target_request_id uuid := 'f3b38004-e5b6-474b-9c3c-7622146d34a8';
  v_old_request_id uuid := 'c026b9bf-6fdf-4074-9f36-8d67bdd95f8f';
  v_invite_id uuid := '7a862494-595e-48fa-b9c0-d56c88dc86c3';
  v_reciprocal_invite_id uuid := '87df377e-523e-47cb-a055-12bcbf2cbc1f';
  v_nhu_y_profile_id uuid := 'c2657294-e12c-49a2-9742-bcdb2b80c738';
  v_minh_tam_profile_id uuid := 'e39515e9-05fc-449c-832e-6afafca4c1dd';
  v_wrong_membership_id uuid := '7ef3091c-ddcf-4664-a15c-50e58ddba077';
  v_canonical_invite public.class_team_invites;
  v_reciprocal_invite public.class_team_invites;
  v_target_request public.team_requests;
  v_old_request public.team_requests;
  v_other_old_members integer;
  v_target_member_count integer;
  v_target_size integer;
begin
  -- Lock and validate the canonical invite before changing either request.
  select i.*
  into v_canonical_invite
  from public.class_team_invites i
  where i.id = v_invite_id
  for update;

  if not found
     or v_canonical_invite.class_id <> v_class_id
     or v_canonical_invite.team_request_id <> v_target_request_id
     or v_canonical_invite.inviter_profile_id <> v_nhu_y_profile_id
     or v_canonical_invite.invitee_profile_id <> v_minh_tam_profile_id
     or v_canonical_invite.status <> 'accepted' then
    raise exception
      'Canonical invite % is missing or does not match the confirmed accepted direction.',
      v_invite_id;
  end if;

  -- The reciprocal row is retained as history, but validate it if present so
  -- this repair cannot silently operate on a different invite relationship.
  select i.*
  into v_reciprocal_invite
  from public.class_team_invites i
  where i.id = v_reciprocal_invite_id
  for update;

  if found and (
    v_reciprocal_invite.class_id <> v_class_id
    or v_reciprocal_invite.team_request_id <> v_old_request_id
    or v_reciprocal_invite.inviter_profile_id <> v_minh_tam_profile_id
    or v_reciprocal_invite.invitee_profile_id <> v_nhu_y_profile_id
  ) then
    raise exception
      'Reciprocal invite % does not match the confirmed historical direction.',
      v_reciprocal_invite_id;
  end if;

  select tr.*
  into v_target_request
  from public.team_requests tr
  where tr.id = v_target_request_id
    and tr.class_id = v_class_id
    and tr.class_session is not distinct from v_class_session
    and tr.profile_id = v_nhu_y_profile_id
  for update;

  if not found then
    raise exception 'Canonical target request % was not found.', v_target_request_id;
  end if;

  select tr.*
  into v_old_request
  from public.team_requests tr
  where tr.id = v_old_request_id
    and tr.class_id = v_class_id
    and tr.class_session is not distinct from v_class_session
    and tr.profile_id = v_minh_tam_profile_id
  for update;

  if not found then
    raise exception 'Old request % was not found.', v_old_request_id;
  end if;

  -- Fail closed if Minh Tâm's request contains any legitimate member besides
  -- the one confirmed reversed row. The owner is implicit and is not stored as
  -- a class_team_memberships row.
  select count(*)::integer
  into v_other_old_members
  from public.class_team_memberships ctm
  where ctm.team_request_id = v_old_request_id
    and ctm.profile_id <> v_nhu_y_profile_id;

  if v_other_old_members > 0 then
    raise exception
      'Old request % has % other active member(s); refusing to orphan them.',
      v_old_request_id,
      v_other_old_members;
  end if;

  if exists (
    select 1
    from public.class_team_memberships ctm
    where ctm.id = v_wrong_membership_id
      and (
        ctm.class_id <> v_class_id
        or ctm.team_request_id <> v_old_request_id
        or ctm.profile_id <> v_nhu_y_profile_id
      )
  ) then
    raise exception
      'Confirmed membership % points to a different class, request, or profile; refusing to continue.',
      v_wrong_membership_id;
  end if;

  -- If the inviter appears on the old request under a different row identity,
  -- stop rather than deleting anything beyond the confirmed membership ID.
  if exists (
    select 1
    from public.class_team_memberships ctm
    where ctm.team_request_id = v_old_request_id
      and ctm.profile_id = v_nhu_y_profile_id
      and ctm.id <> v_wrong_membership_id
  ) then
    raise exception
      'A different membership row represents the confirmed reversed member; refusing to delete it.';
  end if;

  -- Ensure Minh Tâm is on Như Ý's canonical team. The unique key makes this
  -- idempotent when the correct row already exists.
  insert into public.class_team_memberships (class_id, team_request_id, profile_id)
  values (v_class_id, v_target_request_id, v_minh_tam_profile_id)
  on conflict (team_request_id, profile_id) do nothing;

  -- Remove only the confirmed cross-membership. If it was already repaired,
  -- the delete is a safe no-op.
  delete from public.class_team_memberships ctm
  where ctm.id = v_wrong_membership_id
    and ctm.class_id = v_class_id
    and ctm.team_request_id = v_old_request_id
    and ctm.profile_id = v_nhu_y_profile_id;

  -- Minh Tâm's request is now empty. 'found' is the existing terminal request
  -- state; do not invent a new status or delete the request row.
  update public.team_requests tr
  set status = 'found',
      updated_at = now()
  where tr.id = v_old_request_id
    and tr.status = 'looking'
    and not exists (
      select 1
      from public.class_team_memberships ctm
      where ctm.team_request_id = v_old_request_id
    );

  select count(*)::integer
  into v_target_member_count
  from public.class_team_memberships ctm
  where ctm.team_request_id = v_target_request_id;

  v_target_size := greatest(
    coalesce(v_target_request.total_team_size, v_target_request.members_needed + 1),
    1
  );

  if v_target_member_count > v_target_size then
    raise exception
      'Canonical target request would exceed its configured team size (% > %).',
      v_target_member_count,
      v_target_size;
  end if;

  if v_target_member_count >= v_target_size then
    update public.team_requests tr
    set status = 'found',
        updated_at = now()
    where tr.id = v_target_request_id
      and tr.status = 'looking';
  end if;
end;
$repair$;
