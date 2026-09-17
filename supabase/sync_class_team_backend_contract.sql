-- Teamergency: synchronize the partially migrated class-team backend contract.
--
-- MANUAL SUPABASE SQL EDITOR EXECUTION ONLY. Do not run from the application.
-- This file does not create/drop tables and does not repair historical data.
-- No CASCADE is used.

-- The production function currently has the older three-column OUT contract.
-- PostgreSQL cannot replace a function when its OUT-parameter row type changes,
-- so remove only this exact signature before recreating the six-column contract.
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

create or replace function public.remove_class_team_member(
  p_class_id uuid,
  p_team_request_id uuid,
  p_owner_profile_id uuid,
  p_member_profile_id uuid
)
returns table(removed_profile_id uuid)
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not public.owns_profile(p_owner_profile_id) then
    raise exception 'Profile ownership required.';
  end if;

  if p_owner_profile_id = p_member_profile_id then
    raise exception 'The team owner cannot remove themselves.';
  end if;

  if not exists (
    select 1
    from public.team_requests tr
    where tr.id = p_team_request_id
      and tr.class_id = p_class_id
      and tr.profile_id = p_owner_profile_id
  ) then
    raise exception 'Only the team owner can remove members.';
  end if;

  delete from public.class_team_memberships ctm
  where ctm.class_id = p_class_id
    and ctm.team_request_id = p_team_request_id
    and ctm.profile_id = p_member_profile_id;

  update public.class_team_invites i
  set status = 'cancelled',
      responded_at = now()
  where i.class_id = p_class_id
    and i.team_request_id = p_team_request_id
    and i.invitee_profile_id = p_member_profile_id
    and i.status = 'pending';

  return query select p_member_profile_id;
end;
$function$;

create or replace function public.leave_class_team(
  p_class_id uuid,
  p_team_request_id uuid,
  p_profile_id uuid
)
returns table(left_profile_id uuid)
language plpgsql
security definer
set search_path = public
as $function$
declare
  request_owner uuid;
begin
  if not public.owns_profile(p_profile_id) then
    raise exception 'Profile ownership required.';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.role = 'participant'
  ) then
    raise exception 'Participants cannot leave class teams.';
  end if;

  select tr.profile_id
  into request_owner
  from public.team_requests tr
  where tr.id = p_team_request_id
    and tr.class_id = p_class_id;

  if request_owner = p_profile_id then
    raise exception 'The team owner must cancel the request before leaving.';
  end if;

  if not exists (
    select 1
    from public.class_team_memberships ctm
    where ctm.class_id = p_class_id
      and ctm.team_request_id = p_team_request_id
      and ctm.profile_id = p_profile_id
  ) then
    raise exception 'Active class-team membership required.';
  end if;

  delete from public.class_team_memberships ctm
  where ctm.class_id = p_class_id
    and ctm.team_request_id = p_team_request_id
    and ctm.profile_id = p_profile_id;

  return query select p_profile_id;
end;
$function$;

create or replace function public.leave_class(
  p_class_id uuid,
  p_profile_id uuid
)
returns table(left_class_id uuid)
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not public.owns_profile(p_profile_id) then
    raise exception 'Profile ownership required.';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.role = 'participant'
  ) then
    raise exception 'Participants cannot leave classes.';
  end if;

  if exists (
    select 1
    from public.team_requests tr
    where tr.class_id = p_class_id
      and tr.profile_id = p_profile_id
      and tr.status = 'looking'
  ) then
    raise exception 'Cancel the active team request before leaving this class.';
  end if;

  delete from public.class_team_memberships ctm
  where ctm.class_id = p_class_id
    and ctm.profile_id = p_profile_id;

  delete from public.class_members cm
  where cm.class_id = p_class_id
    and cm.profile_id = p_profile_id;

  return query select p_class_id;
end;
$function$;

revoke all on function public.get_team_request_progress(uuid, uuid) from public, anon;
grant execute on function public.get_team_request_progress(uuid, uuid) to authenticated;

revoke all on function public.remove_class_team_member(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.remove_class_team_member(uuid, uuid, uuid, uuid) to authenticated;

revoke all on function public.leave_class_team(uuid, uuid, uuid) from public, anon;
grant execute on function public.leave_class_team(uuid, uuid, uuid) to authenticated;

revoke all on function public.leave_class(uuid, uuid) from public, anon;
grant execute on function public.leave_class(uuid, uuid) to authenticated;
