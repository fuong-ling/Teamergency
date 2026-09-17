-- Teamergency: fix class-team invites between already-connected users.
--
-- MANUAL SUPABASE EXECUTION ONLY. Do not run from the application.
-- This replaces only the class-team invite creation and acceptance RPCs.
-- Friend/connection rows remain independent from class-team membership.
-- No CASCADE is used.

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
  target_request public.team_requests;
  request_size integer;
  total_size integer;
  invite_id uuid;
  invite_status text;
begin
  if not public.owns_profile(p_owner_profile_id) then
    raise exception 'Profile ownership required.';
  end if;

  if p_owner_profile_id = p_invitee_profile_id then
    raise exception 'The team owner cannot invite themselves.';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = p_owner_profile_id
      and p.role = 'participant'
  ) then
    raise exception 'Participants cannot manage class teams.';
  end if;

  -- The owner-supplied request is the only possible target. Never infer a
  -- request from the connection row or from the invitee's own request.
  select tr.*
  into target_request
  from public.team_requests tr
  where tr.id = p_team_request_id
    and tr.class_id = p_class_id
    and tr.profile_id = p_owner_profile_id
    and tr.status = 'looking'
  for update;

  if target_request.id is null then
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

  -- Existing friendship is an eligibility relationship only. Its historical
  -- request IDs never override p_team_request_id.
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
    join public.team_requests other_request
      on other_request.id = ctm.team_request_id
    where ctm.profile_id = p_invitee_profile_id
      and ctm.team_request_id <> target_request.id
      and other_request.class_id = target_request.class_id
      and other_request.class_session is not distinct from target_request.class_session
  ) then
    raise exception 'Invitee is already in another active team for this class and session.';
  end if;

  if exists (
    select 1
    from public.class_team_memberships ctm
    where ctm.team_request_id = target_request.id
      and ctm.profile_id = p_invitee_profile_id
  ) then
    raise exception 'Profile is already in this team.';
  end if;

  if exists (
    select 1
    from public.class_team_invites i
    where i.team_request_id = target_request.id
      and i.invitee_profile_id = p_invitee_profile_id
      and i.status = 'pending'
  ) then
    raise exception 'Invitation is already pending.';
  end if;

  total_size := greatest(
    coalesce(target_request.total_team_size, target_request.members_needed + 1),
    1
  );

  select count(*)::integer + 1
  into request_size
  from public.class_team_memberships ctm
  where ctm.team_request_id = target_request.id;

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
    target_request.class_id,
    target_request.id,
    target_request.profile_id,
    p_invitee_profile_id
  )
  returning class_team_invites.id, class_team_invites.status
  into invite_id, invite_status;

  return query select invite_id, invite_status;
end;
$function$;

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
    -- Lock and validate the exact request stored on the invite. The inviter
    -- must own it; the invitee's request is never substituted as the target.
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

    if not exists (
      select 1
      from public.class_team_memberships ctm
      where ctm.team_request_id = target_request.id
        and ctm.profile_id = p_profile_id
    ) and current_size + 1 >= total_size then
      raise exception 'Team is full or no longer open.';
    end if;

    -- A profile cannot remain in another current team for the same class and
    -- session while accepting this invite.
    if exists (
      select 1
      from public.class_team_memberships ctm
      join public.team_requests other_request
        on other_request.id = ctm.team_request_id
      where ctm.profile_id = p_profile_id
        and ctm.team_request_id <> target_request.id
        and other_request.class_id = target_request.class_id
        and other_request.class_session is not distinct from target_request.class_session
    ) then
      raise exception 'You are already in another active team for this class and session.';
    end if;

    -- If the invitee owns an empty request for this class/session, close only
    -- that request. If it has real teammates, abort before any mutation so no
    -- teammate is orphaned and no automatic merge is attempted.
    for old_request in
      select tr.id
      from public.team_requests tr
      where tr.profile_id = p_profile_id
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

    -- The invitee is the member and the invite's request is the target.
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

revoke all on function public.invite_class_team_member(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.invite_class_team_member(uuid, uuid, uuid, uuid) to authenticated;

revoke all on function public.respond_class_team_invite(uuid, uuid, text) from public, anon;
grant execute on function public.respond_class_team_invite(uuid, uuid, text) to authenticated;

-- Progress for class requests must not fall back to connection metadata. The
-- historical two-column and current six-column contracts cannot be replaced
-- with CREATE OR REPLACE when their OUT parameters differ, so drop only this
-- exact function identity before installing the authoritative six-column
-- contract. No CASCADE is used.
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
      )::integer
    ) as baseline_members
  from public.team_requests tr
  where tr.id = request_id
),
accessible as (
  select target.*
  from target
  where public.owns_profile(current_profile)
    and (
      target.profile_id = current_profile
      or (
        target.class_id is not null
        and exists (
          select 1
          from public.class_team_memberships ctm
          where ctm.team_request_id = target.id
            and ctm.profile_id = current_profile
        )
      )
      or (
        target.class_id is null
        and exists (
          select 1
          from public.team_request_memberships tm
          where tm.team_request_id = target.id
            and tm.member_profile_id = current_profile
        )
      )
    )
),
member_rows as (
  select
    ctm.profile_id as teammate_profile_id,
    null::uuid as connection_id,
    ctm.updated_at
  from accessible target_row
  join public.class_team_memberships ctm
    on ctm.team_request_id = target_row.id
   and target_row.class_id is not null

  union all

  select
    tm.member_profile_id as teammate_profile_id,
    tm.joined_via_connection_id as connection_id,
    tm.updated_at
  from accessible target_row
  join public.team_request_memberships tm
    on tm.team_request_id = target_row.id
   and target_row.class_id is null
),
totals as (
  select
    target_row.baseline_members,
    coalesce(target_row.total_team_size, target_row.members_needed + 1, 2)::integer as total_team_size,
    count(member_rows.teammate_profile_id)::integer as matched_count
  from accessible target_row
  left join member_rows on true
  group by target_row.baseline_members,
    target_row.total_team_size,
    target_row.members_needed
)
select
  least(totals.total_team_size, totals.baseline_members + totals.matched_count)::integer,
  totals.matched_count,
  totals.baseline_members,
  totals.total_team_size,
  greatest(
    0,
    totals.total_team_size
      - least(totals.total_team_size, totals.baseline_members + totals.matched_count)
  )::integer,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'profile_id', member_rows.teammate_profile_id,
          'full_name', member_profile.full_name,
          'major', member_profile.major,
          'is_demo', member_profile.is_demo,
          'connection_id', member_rows.connection_id
        ) order by member_rows.updated_at desc
      )
      from member_rows
      join public.profiles member_profile
        on member_profile.id = member_rows.teammate_profile_id
    ),
    '[]'::jsonb
  )
from totals;
$function$;

revoke all on function public.get_team_request_progress(uuid, uuid) from public, anon;
grant execute on function public.get_team_request_progress(uuid, uuid) to authenticated;
