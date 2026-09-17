-- Teamergency: allow an already-connected classmate to receive a class-team
-- invite even when the connection originated in another project context.
--
-- Run manually in Supabase SQL Editor after review. Do not execute from the
-- application. This file assumes the class-team tables and RPCs from
-- add_class_team_management_and_participant_role.sql already exist.
--
-- Class enrollment, Friend/Connection, and class-team membership remain
-- separate. Current membership and current pending invite are the only
-- class-team states used below.

create or replace function public.list_class_team_invite_candidates(
  p_class_id uuid,
  p_team_request_id uuid,
  p_owner_profile_id uuid
)
returns table(
  profile_id uuid,
  full_name text,
  university text,
  school text,
  major text,
  invite_status text,
  membership_status text,
  eligible boolean
)
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not public.owns_profile(p_owner_profile_id) then
    raise exception 'Profile ownership required.';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = p_owner_profile_id
      and p.role = 'participant'
  ) then
    raise exception 'Participants cannot manage class teams.';
  end if;

  if not exists (
    select 1
    from public.team_requests tr
    join public.class_members owner_members
      on owner_members.class_id = tr.class_id
     and owner_members.profile_id = tr.profile_id
    where tr.id = p_team_request_id
      and tr.class_id = p_class_id
      and tr.profile_id = p_owner_profile_id
      and tr.status = 'looking'
  ) then
    raise exception 'Only the active class-team owner can invite teammates.';
  end if;

  return query
  with request_row as (
    select
      tr.id,
      tr.profile_id,
      tr.status,
      greatest(coalesce(tr.total_team_size, tr.members_needed + 1), 1) as total_team_size
    from public.team_requests tr
    where tr.id = p_team_request_id
      and tr.class_id = p_class_id
  ),
  team_size as (
    select count(*)::integer + 1 as current_size
    from public.class_team_memberships ctm
    where ctm.team_request_id = p_team_request_id
  ),
  candidates as (
    select distinct on (friend_profile.id)
      friend_profile.id,
      friend_profile.full_name,
      friend_profile.university,
      friend_profile.school,
      friend_profile.major,
      pending_invite.status as pending_status,
      member_row.profile_id as active_member_id
    from public.connections c
    join public.profiles friend_profile
      on friend_profile.id = case
        when c.sender_profile_id = p_owner_profile_id then c.receiver_profile_id
        else c.sender_profile_id
      end
    join public.class_members friend_class_member
      on friend_class_member.class_id = p_class_id
     and friend_class_member.profile_id = friend_profile.id
    left join public.class_team_memberships member_row
      on member_row.team_request_id = p_team_request_id
     and member_row.profile_id = friend_profile.id
    left join lateral (
      select i.status
      from public.class_team_invites i
      where i.team_request_id = p_team_request_id
        and i.invitee_profile_id = friend_profile.id
        and i.status = 'pending'
      order by i.created_at desc
      limit 1
    ) pending_invite on true
    where c.status = 'accepted'
      and c.sender_profile_id <> c.receiver_profile_id
      and p_owner_profile_id in (c.sender_profile_id, c.receiver_profile_id)
      and friend_profile.id <> p_owner_profile_id
    order by friend_profile.id, c.updated_at desc nulls last, c.created_at desc
  )
  select
    candidates.id,
    candidates.full_name,
    candidates.university,
    candidates.school,
    candidates.major,
    candidates.pending_status,
    case when candidates.active_member_id is null then null else 'active' end,
    (
      candidates.pending_status is null
      and candidates.active_member_id is null
      and request_row.status = 'looking'
      and team_size.current_size < request_row.total_team_size
    )
  from candidates
  cross join request_row
  cross join team_size
  order by lower(coalesce(candidates.full_name, '')), candidates.id;
end;
$function$;

create or replace function public.invite_class_team_member(
  p_class_id uuid,
  p_team_request_id uuid,
  p_owner_profile_id uuid,
  p_invitee_profile_id uuid
)
returns table(id uuid, status text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  request_size integer;
  total_size integer;
  invite_id uuid;
  invite_status text;
begin
  if not public.owns_profile(p_owner_profile_id) then
    raise exception 'Profile ownership required.';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = p_owner_profile_id
      and p.role = 'participant'
  ) then
    raise exception 'Participants cannot manage class teams.';
  end if;

  select greatest(coalesce(tr.total_team_size, tr.members_needed + 1), 1)
  into total_size
  from public.team_requests tr
  where tr.id = p_team_request_id
    and tr.class_id = p_class_id
    and tr.profile_id = p_owner_profile_id
    and tr.status = 'looking';

  if total_size is null then
    raise exception 'Only the active class-team owner can invite teammates.';
  end if;

  if not exists (
    select 1
    from public.class_members cm
    where cm.class_id = p_class_id
      and cm.profile_id = p_invitee_profile_id
  ) then
    raise exception 'Invitee must be enrolled in this class.';
  end if;

  -- An accepted connection is enough. Do not reject a friend because the
  -- same pair also has an older project/team-request relationship.
  if not exists (
    select 1
    from public.connections c
    where c.status = 'accepted'
      and p_owner_profile_id in (c.sender_profile_id, c.receiver_profile_id)
      and p_invitee_profile_id in (c.sender_profile_id, c.receiver_profile_id)
  ) then
    raise exception 'Invitee must be a connected friend.';
  end if;

  if exists (
    select 1
    from public.class_team_memberships ctm
    where ctm.team_request_id = p_team_request_id
      and ctm.profile_id = p_invitee_profile_id
  ) then
    raise exception 'Profile is already in this team.';
  end if;

  if exists (
    select 1
    from public.class_team_invites i
    where i.team_request_id = p_team_request_id
      and i.invitee_profile_id = p_invitee_profile_id
      and i.status = 'pending'
  ) then
    raise exception 'Invitation is already pending.';
  end if;

  select count(*)::integer + 1
  into request_size
  from public.class_team_memberships ctm
  where ctm.team_request_id = p_team_request_id;

  if request_size >= total_size then
    raise exception 'Team is full.';
  end if;

  insert into public.class_team_invites (
    class_id,
    team_request_id,
    inviter_profile_id,
    invitee_profile_id
  )
  values (
    p_class_id,
    p_team_request_id,
    p_owner_profile_id,
    p_invitee_profile_id
  )
  returning id, status into invite_id, invite_status;

  return query select invite_id, invite_status;
end;
$function$;

revoke all on function public.list_class_team_invite_candidates(uuid, uuid, uuid) from public, anon;
grant execute on function public.list_class_team_invite_candidates(uuid, uuid, uuid) to authenticated;

revoke all on function public.invite_class_team_member(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.invite_class_team_member(uuid, uuid, uuid, uuid) to authenticated;
