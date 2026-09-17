-- Teamergency: read-only audit for post-accept class-team dual state.
--
-- MANUAL SUPABASE SQL EDITOR USE ONLY.
-- Replace the NULL values in params before running.
-- Every statement is SELECT-only. This file does not repair data.

-- 1. Inventory every request and authoritative class-team membership in the
-- selected class/session. The owner is team_requests.profile_id; member rows
-- come only from class_team_memberships.
with params as (
  select
    null::uuid as class_id,
    null::text as class_session
)
select
  tr.id as request_id,
  tr.profile_id as request_owner_id,
  owner_profile.full_name as request_owner_name,
  tr.status as request_status,
  greatest(coalesce(tr.total_team_size, tr.members_needed + 1), 1) as required_team_size,
  ctm.id as membership_id,
  ctm.profile_id as membership_profile_id,
  member_profile.full_name as membership_profile_name,
  invite.id as invite_id,
  invite.inviter_profile_id as invite_inviter_id,
  inviter_profile.full_name as invite_inviter_name,
  invite.invitee_profile_id as invite_invitee_id,
  invitee_profile.full_name as invite_invitee_name,
  invite.team_request_id as invite_target_request_id,
  invite.status as invite_status
from params p
join public.team_requests tr
  on tr.class_id = p.class_id
 and tr.class_session is not distinct from p.class_session
join public.profiles owner_profile
  on owner_profile.id = tr.profile_id
left join public.class_team_memberships ctm
  on ctm.team_request_id = tr.id
left join public.profiles member_profile
  on member_profile.id = ctm.profile_id
left join public.class_team_invites invite
  on invite.team_request_id = tr.id
left join public.profiles inviter_profile
  on inviter_profile.id = invite.inviter_profile_id
left join public.profiles invitee_profile
  on invitee_profile.id = invite.invitee_profile_id
order by tr.id, ctm.created_at, invite.created_at, ctm.profile_id;

-- 2. Direction audit for accepted invites. A correct result has:
--   target_owner_id = inviter_id
--   target_member_id = invitee_id
-- A dual/cross-membership result additionally has the inviter in the
-- invitee-owned request for the same class/session.
with params as (
  select
    null::uuid as class_id,
    null::text as class_session
),
accepted_invites as (
  select
    i.id as invite_id,
    i.class_id,
    i.team_request_id as invite_target_request_id,
    target.profile_id as target_owner_id,
    i.inviter_profile_id as invite_inviter_id,
    i.invitee_profile_id as invite_invitee_id,
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
invitee_requests as (
  select
    ai.*,
    invitee_request.id as invitee_owned_request_id
  from accepted_invites ai
  left join public.team_requests invitee_request
    on invitee_request.profile_id = ai.invite_invitee_id
   and invitee_request.id <> ai.invite_target_request_id
   and invitee_request.class_id = ai.class_id
   and invitee_request.class_session is not distinct from ai.class_session
)
select
  ir.invite_id,
  ir.invite_target_request_id,
  ir.target_owner_id,
  ir.invite_inviter_id,
  ir.invite_invitee_id,
  ir.invitee_owned_request_id,
  target_member.id as target_membership_id,
  target_member.profile_id as target_member_id,
  wrong_member.id as possible_cross_membership_id,
  wrong_member.profile_id as possible_cross_member_id,
  case
    when ir.target_owner_id <> ir.invite_inviter_id
      then 'invalid_invite_target_owner'
    when target_member.profile_id = ir.invite_invitee_id
      and wrong_member.profile_id = ir.invite_inviter_id
      then 'dual_cross_membership'
    when target_member.profile_id = ir.invite_invitee_id
      then 'correct_target_membership_only'
    when wrong_member.profile_id = ir.invite_inviter_id
      then 'cross_membership_only'
    else 'missing_expected_membership'
  end as direction_result
from invitee_requests ir
left join public.class_team_memberships target_member
  on target_member.team_request_id = ir.invite_target_request_id
 and target_member.profile_id = ir.invite_invitee_id
left join public.class_team_memberships wrong_member
  on wrong_member.team_request_id = ir.invitee_owned_request_id
 and wrong_member.profile_id = ir.invite_inviter_id
order by ir.invite_id, ir.invitee_owned_request_id;
