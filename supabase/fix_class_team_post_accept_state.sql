-- Teamergency: synchronize class-team state after invite acceptance.
--
-- MANUAL SUPABASE SQL EDITOR EXECUTION ONLY. Do not run from the application.
-- This replaces only respond_class_team_invite(uuid, uuid, text).
-- No tables or historical rows are changed by installing this function.
-- No CASCADE is used.

create or replace function public.respond_class_team_invite(
  p_invite_id uuid,
  p_profile_id uuid,
  p_response text
)
returns table(id uuid, status text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  invite_row public.class_team_invites;
  target_request public.team_requests;
  old_request record;
  total_size integer;
  current_size integer;
  old_member_count integer;
begin
  if not public.owns_profile(p_profile_id) then
    raise exception 'Profile ownership required.';
  end if;

  if p_response not in ('accepted', 'declined') then
    raise exception 'Invalid invitation response.';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.role = 'participant'
  ) then
    raise exception 'Participants cannot respond to class-team invites.';
  end if;

  select i.*
  into invite_row
  from public.class_team_invites i
  where i.id = p_invite_id
    and i.invitee_profile_id = p_profile_id
    and i.status = 'pending'
  for update;

  if invite_row.id is null then
    raise exception 'Invitation is no longer available.';
  end if;

  if p_response = 'accepted' then
    -- The invite stores the only valid target. The target must belong to the
    -- inviter; the invitee's own request is never substituted.
    select tr.*
    into target_request
    from public.team_requests tr
    where tr.id = invite_row.team_request_id
      and tr.class_id = invite_row.class_id
      and tr.profile_id = invite_row.inviter_profile_id
      and tr.status = 'looking'
    for update;

    if target_request.id is null then
      raise exception 'The invited class team is no longer open.';
    end if;

    if not exists (
      select 1
      from public.class_members cm
      where cm.class_id = invite_row.class_id
        and cm.profile_id = p_profile_id
    ) then
      raise exception 'You must be enrolled in this class.';
    end if;

    total_size := greatest(
      coalesce(target_request.total_team_size, target_request.members_needed + 1),
      1
    );

    select count(*)::integer
    into current_size
    from public.class_team_memberships ctm
    where ctm.team_request_id = target_request.id;

    if current_size >= total_size and not exists (
      select 1
      from public.class_team_memberships ctm
      where ctm.team_request_id = target_request.id
        and ctm.profile_id = invite_row.invitee_profile_id
    ) then
      raise exception 'Team is full or no longer open.';
    end if;

    -- Do not allow two current teams for one profile in the same class/session.
    if exists (
      select 1
      from public.class_team_memberships ctm
      join public.team_requests other_request
        on other_request.id = ctm.team_request_id
      where ctm.profile_id = invite_row.invitee_profile_id
        and ctm.team_request_id <> target_request.id
        and other_request.class_id = target_request.class_id
        and other_request.class_session is not distinct from target_request.class_session
    ) then
      raise exception 'You are already in another active team for this class and session.';
    end if;

    -- Close only an empty request owned by the invitee. If it has another
    -- current class-team member, abort before any mutation to avoid orphaning
    -- that teammate or silently merging teams.
    for old_request in
      select tr.id
      from public.team_requests tr
      where tr.profile_id = invite_row.invitee_profile_id
        and tr.id <> target_request.id
        and tr.class_id = target_request.class_id
        and tr.class_session is not distinct from target_request.class_session
        and tr.status = 'looking'
      for update
    loop
      select count(*)::integer
      into old_member_count
      from public.class_team_memberships ctm
      where ctm.team_request_id = old_request.id;

      if old_member_count > 0 then
        raise exception 'Resolve your current class team before accepting another team invitation.';
      end if;

      update public.team_requests tr
      set status = 'found',
          updated_at = now()
      where tr.id = old_request.id
        and tr.status = 'looking';
    end loop;

    -- The invitee joins the invite target. The owner is implicit in
    -- team_requests.profile_id and is never inserted as a member row.
    insert into public.class_team_memberships (
      class_id,
      team_request_id,
      profile_id
    )
    values (
      target_request.class_id,
      target_request.id,
      invite_row.invitee_profile_id
    )
    on conflict (team_request_id, profile_id)
    do update set updated_at = now();

    select count(*)::integer + 1
    into current_size
    from public.class_team_memberships ctm
    where ctm.team_request_id = target_request.id;

    if current_size >= total_size then
      update public.team_requests tr
      set status = 'found',
          updated_at = now()
      where tr.id = target_request.id
        and tr.status = 'looking';
    end if;
  end if;

  update public.class_team_invites i
  set status = p_response,
      responded_at = now()
  where i.id = invite_row.id;

  return query select invite_row.id, p_response;
end;
$function$;

revoke all on function public.respond_class_team_invite(uuid, uuid, text) from public, anon;
grant execute on function public.respond_class_team_invite(uuid, uuid, text) to authenticated;
