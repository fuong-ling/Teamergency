-- Teamergency: audit legacy members missing from the authoritative class team.
--
-- MANUAL SUPABASE SQL EDITOR USE ONLY.
-- This file is SELECT-only. It does not insert, update, delete, or repair data.
-- The audit is intentionally limited to Như Ý's confirmed request.

with target_request as (
  select
    tr.id,
    tr.class_id,
    tr.class_session,
    tr.profile_id as owner_profile_id,
    tr.status,
    greatest(coalesce(tr.total_team_size, tr.members_needed + 1), 1) as required_team_size
  from public.team_requests tr
  where tr.id = 'f3b38004-e5b6-474b-9c3c-7622146d34a8'::uuid
),
authoritative_members as (
  select
    tr.owner_profile_id as profile_id,
    tr.id as team_request_id,
    'team_requests'::text as source_table,
    tr.id as source_row_id,
    'implicit_owner'::text as source_status
  from target_request tr

  union all

  select
    ctm.profile_id,
    ctm.team_request_id,
    'class_team_memberships'::text,
    ctm.id,
    'authoritative_active_membership'::text
  from public.class_team_memberships ctm
  join target_request tr on tr.id = ctm.team_request_id
),
legacy_evidence as (
  -- The historical team_members table is direct request-specific evidence.
  -- It has no status column, so the source status is reported as present.
  select
    tm.teammate_profile_id as profile_id,
    'team_members'::text as source_table,
    tm.id as source_row_id,
    'present_no_status_column'::text as source_status,
    tm.team_request_id as request_a_id,
    null::uuid as request_b_id,
    tm.connection_id,
    null::uuid as sender_team_request_id,
    null::uuid as receiver_team_request_id,
    null::text as connection_context,
    'teammate'::text as relationship_type,
    true as explicit_target_link,
    true as accepted_team_evidence,
    'Exact team_request_id on legacy team_members row.'::text as source_notes
  from public.team_members tm
  join target_request tr on tr.id = tm.team_request_id
  where tm.teammate_profile_id <> tr.owner_profile_id

  union all

  -- teammate_relationships is valid legacy evidence only when the exact
  -- request is linked both by the relationship and by its accepted connection.
  select
    case
      when rel.profile_a_id = tr.owner_profile_id then rel.profile_b_id
      else rel.profile_a_id
    end as profile_id,
    'teammate_relationships'::text,
    rel.id,
    concat('relationship:', rel.status, '; connection:', c.status),
    rel.request_a_id,
    rel.request_b_id,
    rel.connection_id,
    c.sender_team_request_id,
    c.receiver_team_request_id,
    c.connection_context,
    c.relationship_type,
    (
      tr.id in (rel.request_a_id, rel.request_b_id)
      and tr.id in (c.sender_team_request_id, c.receiver_team_request_id)
    ),
    (
      rel.status = 'active'
      and c.status = 'accepted'
      and c.connection_context = 'team_request'
      and c.relationship_type = 'teammate'
      and tr.id in (rel.request_a_id, rel.request_b_id)
      and tr.id in (c.sender_team_request_id, c.receiver_team_request_id)
    ),
    'Request linkage must agree across relationship and accepted connection.'::text
  from public.teammate_relationships rel
  join target_request tr
    on tr.id in (rel.request_a_id, rel.request_b_id)
  join public.connections c on c.id = rel.connection_id
  where tr.owner_profile_id in (rel.profile_a_id, rel.profile_b_id)
    and case
      when rel.profile_a_id = tr.owner_profile_id then rel.profile_b_id
      else rel.profile_a_id
    end <> tr.owner_profile_id

  union all

  -- Include all connections involving the target owner so ordinary Friend /
  -- Discover rows are visible and explicitly excluded from migration.
  select
    case
      when c.sender_profile_id = tr.owner_profile_id then c.receiver_profile_id
      else c.sender_profile_id
    end as profile_id,
    'connections'::text,
    c.id,
    c.status,
    null::uuid,
    null::uuid,
    c.id,
    c.sender_team_request_id,
    c.receiver_team_request_id,
    c.connection_context,
    c.relationship_type,
    (
      tr.id in (c.sender_team_request_id, c.receiver_team_request_id)
    ),
    (
      c.status = 'accepted'
      and c.connection_context = 'team_request'
      and c.relationship_type = 'teammate'
      and tr.id in (c.sender_team_request_id, c.receiver_team_request_id)
    ),
    case
      when tr.id in (c.sender_team_request_id, c.receiver_team_request_id)
        then 'Connection explicitly references target request.'
      else 'No explicit target-request linkage; never migrate from this row alone.'
    end
  from public.connections c
  join target_request tr
    on tr.owner_profile_id in (c.sender_profile_id, c.receiver_profile_id)
  where case
    when c.sender_profile_id = tr.owner_profile_id then c.receiver_profile_id
    else c.sender_profile_id
  end <> tr.owner_profile_id
),
candidate_profiles as (
  select profile_id from authoritative_members
  union
  select profile_id from legacy_evidence
),
candidate_context as (
  select
    cp.profile_id,
    p.full_name,
    exists (
      select 1
      from public.class_members cm
      join target_request tr on tr.class_id = cm.class_id
      where cm.profile_id = cp.profile_id
    ) as class_enrolled,
    exists (
      select 1
      from public.team_requests candidate_request
      join target_request tr
        on tr.class_id = candidate_request.class_id
       and tr.class_session is not distinct from candidate_request.class_session
      where candidate_request.profile_id = cp.profile_id
        and candidate_request.id <> tr.id
        and candidate_request.status in ('looking', 'found')
    ) as same_class_session_request_exists
  from candidate_profiles cp
  join public.profiles p on p.id = cp.profile_id
),
profile_flags as (
  select
    cp.profile_id,
    exists (
      select 1
      from authoritative_members am
      where am.profile_id = cp.profile_id
    ) as authoritative_member,
    coalesce(bool_or(le.accepted_team_evidence), false) as has_valid_legacy_evidence,
    coalesce(bool_or(le.explicit_target_link), false) as has_explicit_target_link,
    count(le.source_row_id)::integer as evidence_row_count
  from candidate_profiles cp
  left join legacy_evidence le on le.profile_id = cp.profile_id
  group by cp.profile_id
),
profile_classification as (
  select
    pf.profile_id,
    case
      when pf.authoritative_member then 'authoritative_member'
      when pf.has_valid_legacy_evidence
        then 'legacy_candidate_missing_authoritative_membership'
      when pf.has_explicit_target_link
        then 'ambiguous_do_not_migrate'
      else 'unrelated_connection'
    end as classification,
    pf.evidence_row_count
  from profile_flags pf
)

-- Query 1: authoritative current state, including the implicit owner.
select
  am.profile_id,
  p.full_name,
  am.source_table,
  am.source_row_id,
  am.source_status,
  am.team_request_id,
  true as explicit_target_link,
  true as current_authoritative_member
from authoritative_members am
join public.profiles p on p.id = am.profile_id
order by am.profile_id, am.source_table;

-- Query 2: every legacy evidence row and its per-profile classification.
with target_request as (
  select tr.id, tr.class_id, tr.class_session, tr.profile_id as owner_profile_id
  from public.team_requests tr
  where tr.id = 'f3b38004-e5b6-474b-9c3c-7622146d34a8'::uuid
),
authoritative_members as (
  select tr.owner_profile_id as profile_id, tr.id as team_request_id
  from target_request tr
  union all
  select ctm.profile_id, ctm.team_request_id
  from public.class_team_memberships ctm
  join target_request tr on tr.id = ctm.team_request_id
),
legacy_evidence as (
  select
    tm.teammate_profile_id as profile_id,
    'team_members'::text as source_table,
    tm.id as source_row_id,
    'present_no_status_column'::text as source_status,
    tm.team_request_id as request_a_id,
    null::uuid as request_b_id,
    tm.connection_id,
    null::uuid as sender_team_request_id,
    null::uuid as receiver_team_request_id,
    null::text as connection_context,
    'teammate'::text as relationship_type,
    true as explicit_target_link,
    true as accepted_team_evidence,
    'Exact team_request_id on legacy team_members row.'::text as source_notes
  from public.team_members tm
  join target_request tr on tr.id = tm.team_request_id
  where tm.teammate_profile_id <> tr.owner_profile_id
  union all
  select
    case when rel.profile_a_id = tr.owner_profile_id then rel.profile_b_id else rel.profile_a_id end,
    'teammate_relationships'::text,
    rel.id,
    concat('relationship:', rel.status, '; connection:', c.status),
    rel.request_a_id,
    rel.request_b_id,
    rel.connection_id,
    c.sender_team_request_id,
    c.receiver_team_request_id,
    c.connection_context,
    c.relationship_type,
    tr.id in (rel.request_a_id, rel.request_b_id)
      and tr.id in (c.sender_team_request_id, c.receiver_team_request_id),
    rel.status = 'active'
      and c.status = 'accepted'
      and c.connection_context = 'team_request'
      and c.relationship_type = 'teammate'
      and tr.id in (rel.request_a_id, rel.request_b_id)
      and tr.id in (c.sender_team_request_id, c.receiver_team_request_id),
    'Request linkage must agree across relationship and accepted connection.'::text
  from public.teammate_relationships rel
  join target_request tr on tr.id in (rel.request_a_id, rel.request_b_id)
  join public.connections c on c.id = rel.connection_id
  where tr.owner_profile_id in (rel.profile_a_id, rel.profile_b_id)
    and case when rel.profile_a_id = tr.owner_profile_id then rel.profile_b_id else rel.profile_a_id end <> tr.owner_profile_id
  union all
  select
    case when c.sender_profile_id = tr.owner_profile_id then c.receiver_profile_id else c.sender_profile_id end,
    'connections'::text,
    c.id,
    c.status,
    null::uuid,
    null::uuid,
    c.id,
    c.sender_team_request_id,
    c.receiver_team_request_id,
    c.connection_context,
    c.relationship_type,
    tr.id in (c.sender_team_request_id, c.receiver_team_request_id),
    c.status = 'accepted'
      and c.connection_context = 'team_request'
      and c.relationship_type = 'teammate'
      and tr.id in (c.sender_team_request_id, c.receiver_team_request_id),
    case when tr.id in (c.sender_team_request_id, c.receiver_team_request_id)
      then 'Connection explicitly references target request.'
      else 'No explicit target-request linkage; never migrate from this row alone.'
    end
  from public.connections c
  join target_request tr on tr.owner_profile_id in (c.sender_profile_id, c.receiver_profile_id)
  where case when c.sender_profile_id = tr.owner_profile_id then c.receiver_profile_id else c.sender_profile_id end <> tr.owner_profile_id
),
candidate_profiles as (
  select profile_id from authoritative_members union select profile_id from legacy_evidence
),
candidate_context as (
  select
    cp.profile_id,
    p.full_name,
    exists (select 1 from public.class_members cm join target_request tr on tr.class_id = cm.class_id where cm.profile_id = cp.profile_id) as class_enrolled,
    exists (
      select 1
      from public.team_requests candidate_request
      join target_request tr on tr.class_id = candidate_request.class_id and tr.class_session is not distinct from candidate_request.class_session
      where candidate_request.profile_id = cp.profile_id and candidate_request.id <> tr.id and candidate_request.status in ('looking', 'found')
    ) as same_class_session_request_exists
  from candidate_profiles cp join public.profiles p on p.id = cp.profile_id
),
profile_flags as (
  select
    cp.profile_id,
    exists (select 1 from authoritative_members am where am.profile_id = cp.profile_id) as authoritative_member,
    coalesce(bool_or(le.accepted_team_evidence), false) as has_valid_legacy_evidence,
    coalesce(bool_or(le.explicit_target_link), false) as has_explicit_target_link
  from candidate_profiles cp left join legacy_evidence le on le.profile_id = cp.profile_id
  group by cp.profile_id
),
profile_classification as (
  select
    pf.profile_id,
    case
      when pf.authoritative_member then 'authoritative_member'
      when pf.has_valid_legacy_evidence then 'legacy_candidate_missing_authoritative_membership'
      when pf.has_explicit_target_link then 'ambiguous_do_not_migrate'
      else 'unrelated_connection'
    end as classification
  from profile_flags pf
)
select
  le.profile_id,
  p.full_name,
  le.source_table,
  le.source_row_id,
  le.source_status,
  le.request_a_id,
  le.request_b_id,
  le.sender_team_request_id,
  le.receiver_team_request_id,
  le.connection_id,
  le.connection_context,
  le.relationship_type,
  le.explicit_target_link,
  le.accepted_team_evidence,
  cc.class_enrolled,
  cc.same_class_session_request_exists,
  case
    when cc.class_enrolled and (le.explicit_target_link or cc.same_class_session_request_exists)
      then true
    else false
  end as class_session_eligible,
  pc.classification,
  le.source_notes
from legacy_evidence le
join public.profiles p on p.id = le.profile_id
join candidate_context cc on cc.profile_id = le.profile_id
join profile_classification pc on pc.profile_id = le.profile_id
order by le.profile_id, le.source_table, le.source_row_id;

-- Query 3: one row per candidate, suitable for deciding whether a separate
-- backfill file is justified. No row here authorizes migration automatically.
with target_request as (
  select tr.id, tr.class_id, tr.class_session, tr.profile_id as owner_profile_id
  from public.team_requests tr
  where tr.id = 'f3b38004-e5b6-474b-9c3c-7622146d34a8'::uuid
),
authoritative_members as (
  select tr.owner_profile_id as profile_id from target_request tr
  union all
  select ctm.profile_id from public.class_team_memberships ctm join target_request tr on tr.id = ctm.team_request_id
),
legacy_evidence as (
  select tm.teammate_profile_id as profile_id, true as explicit_target_link, true as accepted_team_evidence
  from public.team_members tm join target_request tr on tr.id = tm.team_request_id
  where tm.teammate_profile_id <> tr.owner_profile_id
  union all
  select
    case when rel.profile_a_id = tr.owner_profile_id then rel.profile_b_id else rel.profile_a_id end,
    tr.id in (rel.request_a_id, rel.request_b_id) and tr.id in (c.sender_team_request_id, c.receiver_team_request_id),
    rel.status = 'active' and c.status = 'accepted' and c.connection_context = 'team_request' and c.relationship_type = 'teammate'
      and tr.id in (rel.request_a_id, rel.request_b_id) and tr.id in (c.sender_team_request_id, c.receiver_team_request_id)
  from public.teammate_relationships rel
  join target_request tr on tr.id in (rel.request_a_id, rel.request_b_id)
  join public.connections c on c.id = rel.connection_id
  where tr.owner_profile_id in (rel.profile_a_id, rel.profile_b_id)
  union all
  select
    case when c.sender_profile_id = tr.owner_profile_id then c.receiver_profile_id else c.sender_profile_id end,
    tr.id in (c.sender_team_request_id, c.receiver_team_request_id),
    c.status = 'accepted' and c.connection_context = 'team_request' and c.relationship_type = 'teammate'
      and tr.id in (c.sender_team_request_id, c.receiver_team_request_id)
  from public.connections c
  join target_request tr on tr.owner_profile_id in (c.sender_profile_id, c.receiver_profile_id)
  where case when c.sender_profile_id = tr.owner_profile_id then c.receiver_profile_id else c.sender_profile_id end <> tr.owner_profile_id
),
candidate_profiles as (
  select profile_id from authoritative_members union select profile_id from legacy_evidence
)
select
  cp.profile_id,
  p.full_name,
  exists (select 1 from authoritative_members am where am.profile_id = cp.profile_id) as authoritative_member,
  coalesce(bool_or(le.accepted_team_evidence), false) as valid_legacy_evidence,
  coalesce(bool_or(le.explicit_target_link), false) as explicit_target_link,
  case
    when exists (select 1 from authoritative_members am where am.profile_id = cp.profile_id) then 'authoritative_member'
    when coalesce(bool_or(le.accepted_team_evidence), false) then 'legacy_candidate_missing_authoritative_membership'
    when coalesce(bool_or(le.explicit_target_link), false) then 'ambiguous_do_not_migrate'
    else 'unrelated_connection'
  end as classification
from candidate_profiles cp
join public.profiles p on p.id = cp.profile_id
left join legacy_evidence le on le.profile_id = cp.profile_id
group by cp.profile_id, p.full_name
order by cp.profile_id;
