-- Teamergency: read-only audit for class-team invite direction.
--
-- MANUAL SUPABASE SQL EDITOR USE ONLY.
-- Replace the three NULL values in params before running each query.
-- Every statement in this file is SELECT-only. It does not repair data.

-- 1. Show the current class-team requests and authoritative membership rows.
with params as (
  select
    null::uuid as class_id,
    null::text as class_session
),
request_sizes as (
  select
    tr.id as team_request_id,
    count(ctm.profile_id)::integer as current_member_count
  from public.team_requests tr
  left join public.class_team_memberships ctm
    on ctm.team_request_id = tr.id
  group by tr.id
)
select
  tr.id as team_request_id,
  tr.profile_id as owner_profile_id,
  owner.full_name as owner_name,
  tr.class_id,
  tr.class_session,
  tr.status,
  greatest(coalesce(tr.total_team_size, tr.members_needed + 1), 1) as total_team_size,
  coalesce(rs.current_member_count, 0) as current_member_count,
  ctm.profile_id as member_profile_id,
  member.full_name as member_name,
  ctm.created_at as membership_created_at,
  ctm.updated_at as membership_updated_at
from params p
join public.team_requests tr
  on tr.class_id = p.class_id
 and tr.class_session is not distinct from p.class_session
join public.profiles owner
  on owner.id = tr.profile_id
left join request_sizes rs
  on rs.team_request_id = tr.id
left join public.class_team_memberships ctm
  on ctm.team_request_id = tr.id
left join public.profiles member
  on member.id = ctm.profile_id
order by tr.created_at desc, tr.id, ctm.created_at, ctm.profile_id;

-- 2. Show all class-team invites in the selected class/session, including the
-- explicit target request, inviter, invitee, and current invite status.
with params as (
  select
    null::uuid as class_id,
    null::text as class_session
)
select
  i.id as invite_id,
  i.status as invite_status,
  i.team_request_id as target_team_request_id,
  target.profile_id as target_owner_profile_id,
  target_owner.full_name as target_owner_name,
  i.inviter_profile_id,
  inviter.full_name as inviter_name,
  i.invitee_profile_id,
  invitee.full_name as invitee_name,
  i.class_id,
  target.class_session,
  i.created_at,
  i.responded_at
from params p
join public.class_team_invites i
  on i.class_id = p.class_id
join public.team_requests target
  on target.id = i.team_request_id
 and target.class_id = i.class_id
 and target.class_session is not distinct from p.class_session
left join public.profiles target_owner
  on target_owner.id = target.profile_id
left join public.profiles inviter
  on inviter.id = i.inviter_profile_id
left join public.profiles invitee
  on invitee.id = i.invitee_profile_id
order by i.created_at, i.id;

-- 3. Direction audit for accepted invites.
--
-- CORRECT means the invitee is a member of the invite's explicit target
-- request. POTENTIAL_REVERSED means the inviter was written into a request
-- owned by the invitee in the same class/session. The latter is the historical
-- shape that must be reviewed before any repair is run.
with params as (
  select
    null::uuid as class_id,
    null::text as class_session
),
accepted_invites as (
  select
    i.id as invite_id,
    i.class_id,
    i.team_request_id as target_team_request_id,
    i.inviter_profile_id,
    i.invitee_profile_id,
    target.class_session
  from params p
  join public.class_team_invites i
    on i.class_id = p.class_id
   and i.status = 'accepted'
  join public.team_requests target
    on target.id = i.team_request_id
   and target.class_id = i.class_id
   and target.class_session is not distinct from p.class_session
),
invitee_owned_requests as (
  select
    ai.*,
    own.id as invitee_owned_request_id
  from accepted_invites ai
  left join public.team_requests own
    on own.profile_id = ai.invitee_profile_id
   and own.id <> ai.target_team_request_id
   and own.class_id = ai.class_id
   and own.class_session is not distinct from ai.class_session
)
select
  ior.invite_id,
  ior.target_team_request_id,
  ior.inviter_profile_id,
  inviter.full_name as inviter_name,
  ior.invitee_profile_id,
  invitee.full_name as invitee_name,
  ior.invitee_owned_request_id,
  expected.profile_id as expected_target_member_profile_id,
  reversed.profile_id as possible_reversed_member_profile_id,
  case
    when expected.profile_id = ior.invitee_profile_id
      and reversed.profile_id = ior.inviter_profile_id
      then 'target_and_reversed_rows_both_exist'
    when expected.profile_id = ior.invitee_profile_id
      and reversed.profile_id is null
      then 'correct_target_member'
    when reversed.profile_id = ior.inviter_profile_id
      then 'potential_reversed_membership'
    else 'no_matching_membership_row'
  end as direction_result
from invitee_owned_requests ior
left join public.class_team_memberships expected
  on expected.team_request_id = ior.target_team_request_id
 and expected.profile_id = ior.invitee_profile_id
left join public.class_team_memberships reversed
  on reversed.team_request_id = ior.invitee_owned_request_id
 and reversed.profile_id = ior.inviter_profile_id
left join public.profiles inviter
  on inviter.id = ior.inviter_profile_id
left join public.profiles invitee
  on invitee.id = ior.invitee_profile_id
order by ior.invite_id, ior.invitee_owned_request_id;

-- 4. Compact list of rows that specifically need manual review.
with params as (
  select
    null::uuid as class_id,
    null::text as class_session
),
accepted_invites as (
  select
    i.id as invite_id,
    i.team_request_id as target_team_request_id,
    i.inviter_profile_id,
    i.invitee_profile_id,
    i.class_id,
    target.class_session
  from params p
  join public.class_team_invites i
    on i.class_id = p.class_id
   and i.status = 'accepted'
  join public.team_requests target
    on target.id = i.team_request_id
   and target.class_id = i.class_id
   and target.class_session is not distinct from p.class_session
)
select
  ai.invite_id,
  ai.target_team_request_id,
  ai.inviter_profile_id,
  ai.invitee_profile_id,
  old_request.id as suspected_wrong_team_request_id,
  wrong_membership.id as suspected_wrong_membership_id
from accepted_invites ai
join public.team_requests old_request
  on old_request.profile_id = ai.invitee_profile_id
 and old_request.id <> ai.target_team_request_id
 and old_request.class_id = ai.class_id
 and old_request.class_session is not distinct from ai.class_session
join public.class_team_memberships wrong_membership
  on wrong_membership.team_request_id = old_request.id
 and wrong_membership.profile_id = ai.inviter_profile_id
where not exists (
  select 1
  from public.class_team_memberships target_membership
  where target_membership.team_request_id = ai.target_team_request_id
    and target_membership.profile_id = ai.invitee_profile_id
)
order by ai.invite_id, old_request.id;
