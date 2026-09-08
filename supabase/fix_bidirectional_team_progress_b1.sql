-- Teamergency B1: bidirectional and transitive live team progress.
--
-- Run manually in Supabase SQL Editor.
-- This file does not modify acceptance behavior, candidate filtering, tables,
-- or data. It uses the stable team_requests.baseline_member_count created by
-- Task A and preserves the existing progress function signatures/contracts.

-- A request component is the set of distinct requests connected by active,
-- accepted teammate relationships that have both request references. A direct
-- teammate with no second request remains an external profile of the target
-- component without creating a synthetic request node.
create or replace function public.get_team_request_component_status_b1(target_request uuid)
returns table(
  current_members integer,
  baseline_members integer,
  matched_members integer,
  teammate_profiles jsonb
)
language sql
stable
security definer
set search_path = public
as $function$
  with recursive component_requests(request_id) as (
    select target_request

    union

    select
      case
        when rel.request_a_id = cr.request_id then rel.request_b_id
        else rel.request_a_id
      end
    from component_requests cr
    join public.teammate_relationships rel
      on rel.status = 'active'
     and (rel.request_a_id = cr.request_id or rel.request_b_id = cr.request_id)
    join public.connections c on c.id = rel.connection_id
    where c.status = 'accepted'
      and c.relationship_type = 'teammate'
      and rel.request_a_id is not null
      and rel.request_b_id is not null
  ),
  requests as (
    select
      tr.id as request_id,
      tr.profile_id as owner_profile_id,
      greatest(
        1,
        coalesce(
          tr.baseline_member_count,
          coalesce(tr.total_team_size, tr.members_needed + 1, 2)
            - coalesce(tr.teammates_needed_initial, tr.members_needed, 1)
        )
      )::integer as baseline_member_count
    from public.team_requests tr
    join component_requests cr on cr.request_id = tr.id
  ),
  request_owners as (
    select distinct owner_profile_id as profile_id
    from requests
  ),
  active_relationships as (
    select
      rel.connection_id,
      rel.profile_a_id,
      rel.profile_b_id,
      rel.request_a_id,
      rel.request_b_id,
      rel.created_at
    from public.teammate_relationships rel
    join public.connections c on c.id = rel.connection_id
    where rel.status = 'active'
      and c.status = 'accepted'
      and c.relationship_type = 'teammate'
      and (
        rel.request_a_id in (select request_id from requests)
        or rel.request_b_id in (select request_id from requests)
      )
  ),
  -- baseline_member_count is already the complete numeric baseline for each
  -- request. It is intentionally not reduced by team_members: that table has
  -- no creation-time/baseline marker and may contain teammates added later.
  component_totals as (
    select
      coalesce(sum(r.baseline_member_count), 0)::integer as baseline_sum,
      coalesce((
        select count(distinct external_profile.profile_id)::integer
        from (
          select ar.profile_a_id as profile_id
          from active_relationships ar

          union

          select ar.profile_b_id as profile_id
          from active_relationships ar
        ) external_profile
        where external_profile.profile_id is not null
          and not exists (
            select 1
            from request_owners ro
            where ro.profile_id = external_profile.profile_id
          )
      ), 0)::integer as external_profile_count
    from requests r
  ),
  component_profiles as (
    -- Display profiles are separate from numeric progress. Request owners are
    -- included for teammate summaries, while only external profiles from
    -- active accepted relationships contribute beyond the request baselines.
    select r.owner_profile_id as profile_id
    from requests r

    union

    select ar.profile_a_id
    from active_relationships ar

    union

    select ar.profile_b_id
    from active_relationships ar

    union

    -- Keep accepted team_members available for display only. They are never
    -- used by component_totals and therefore cannot reduce any baseline.
    select tm.teammate_profile_id
    from public.team_members tm
    join requests r on r.request_id = tm.team_request_id
    join public.connections c on c.id = tm.connection_id
    where c.status = 'accepted'
      and c.relationship_type = 'teammate'
  ),
  totals as (
    select
      greatest(0, component_totals.baseline_sum + component_totals.external_profile_count)::integer as raw_current_members,
      coalesce((
        select r.baseline_member_count
        from requests r
        where r.request_id = target_request
      ), 1)::integer as target_baseline_members
    from component_totals
  ),
  capped as (
    select
      least(
        coalesce(r.total_team_size, r.members_needed + 1, 2)::integer,
        t.raw_current_members
      )::integer as current_members,
      t.target_baseline_members,
      r.total_team_size,
      r.members_needed
    from totals t
    left join public.team_requests r on r.id = target_request
  ),
  teammate_rows as (
    select distinct on (p.id)
      p.id as profile_id,
      p.full_name,
      p.major,
      p.skills,
      p.is_demo,
      relation.connection_id,
      relation.created_at
    from component_profiles cp
    join public.profiles p on p.id = cp.profile_id
    left join lateral (
      select
        ar.connection_id,
        ar.created_at
      from active_relationships ar
      where target_request in (ar.request_a_id, ar.request_b_id)
        and p.id in (ar.profile_a_id, ar.profile_b_id)
      order by ar.created_at desc
      limit 1
    ) relation on true
    where p.id <> coalesce((select owner_profile_id from requests where request_id = target_request), p.id)
    order by p.id, relation.created_at desc nulls last
  )
  select
    capped.current_members,
    capped.target_baseline_members,
    greatest(0, capped.current_members - capped.target_baseline_members)::integer,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'profile_id', teammate_rows.profile_id,
            'full_name', teammate_rows.full_name,
            'major', teammate_rows.major,
            'skills', teammate_rows.skills,
            'is_demo', teammate_rows.is_demo,
            'connection_id', teammate_rows.connection_id,
            'active_request_id', active_request.id
          )
          order by teammate_rows.created_at desc nulls last, teammate_rows.full_name
        )
        from teammate_rows
        left join lateral (
          select tr.id
          from public.team_requests tr
          where tr.profile_id = teammate_rows.profile_id
            and tr.status = 'looking'
          order by tr.created_at desc
          limit 1
        ) active_request on true
      ),
      '[]'::jsonb
    )
  from capped;
$function$;

-- Preserve the existing scalar helper contract while deriving it from the
-- merged component and the stable target-request baseline.
create or replace function public.get_request_matched_teammate_count(target_request uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(status.matched_members, 0)::integer
  from public.get_team_request_component_status_b1(target_request) status;
$function$;

-- Preserve the existing six-column progress contract. Every request owner in
-- a connected component receives the same merged current_members value when
-- this function is called for that request owner.
create or replace function public.get_team_request_progress(
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
set search_path = public
as $function$
  select
    least(
      coalesce(tr.total_team_size, tr.members_needed + 1, 2)::integer,
      coalesce(status.current_members, 0)
    )::integer as found_count,
    coalesce(status.matched_members, 0)::integer as matched_count,
    coalesce(status.baseline_members, 1)::integer as existing_members,
    coalesce(tr.total_team_size, tr.members_needed + 1, 2)::integer as total_team_size,
    greatest(
      0,
      coalesce(tr.total_team_size, tr.members_needed + 1, 2)::integer
        - least(
          coalesce(tr.total_team_size, tr.members_needed + 1, 2)::integer,
          coalesce(status.current_members, 0)
        )
    )::integer as remaining_spots,
    coalesce(status.teammate_profiles, '[]'::jsonb) as teammates
  from public.team_requests tr
  left join lateral public.get_team_request_component_status_b1(tr.id) status on true
  where tr.id = request_id
    and tr.profile_id = current_profile
    and public.owns_profile(current_profile);
$function$;

-- Keep the production parameter name request_row and the existing JSON keys.
-- class_teams is used only for existing display metadata; its current_members
-- value is never used as live progress.
create or replace function public.request_team_status_json_v2(request_row public.team_requests)
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
  with live as (
    select
      coalesce(request_row.total_team_size, request_row.members_needed + 1, 2)::integer as total_members,
      coalesce(status.current_members, 0)::integer as current_members
    from public.get_team_request_component_status_b1(request_row.id) status
  )
  select case
    when request_row.class_id is null then jsonb_build_object(
      'remaining_members', greatest(0, live.total_members - least(live.total_members, live.current_members)),
      'status', case
        when live.current_members >= live.total_members then 'complete'
        else 'forming'
      end,
      'status_label', case
        when live.current_members >= live.total_members then 'Team complete'
        else 'Looking for ' || greatest(0, live.total_members - least(live.total_members, live.current_members)) || ' teammate(s)'
      end
    )
    else coalesce((
      select jsonb_build_object(
        'id', t.id,
        'team_name', t.team_name,
        'required_members', live.total_members,
        'current_members', least(live.total_members, live.current_members),
        'remaining_members', greatest(0, live.total_members - least(live.total_members, live.current_members)),
        'status', case
          when live.current_members >= live.total_members then 'complete'
          else 'forming'
        end,
        'status_label', public.class_team_status_label(
          least(live.total_members, live.current_members),
          live.total_members
        )
      )
      from public.class_teams t
      where t.class_id = request_row.class_id
        and t.owner_profile_id = request_row.profile_id
      order by t.updated_at desc
      limit 1
    ), jsonb_build_object(
      'required_members', live.total_members,
      'current_members', least(live.total_members, live.current_members),
      'remaining_members', greatest(0, live.total_members - least(live.total_members, live.current_members)),
      'status', case
        when live.current_members >= live.total_members then 'complete'
        else 'forming'
      end,
      'status_label', case
        when live.current_members >= live.total_members then 'Team complete'
        else 'Looking for ' || greatest(0, live.total_members - least(live.total_members, live.current_members)) || ' teammate(s)'
      end
    ))
  end
  from live;
$function$;

revoke all on function public.get_team_request_component_status_b1(uuid) from public;
grant execute on function public.get_request_matched_teammate_count(uuid) to anon, authenticated;
grant execute on function public.get_team_request_progress(uuid, uuid) to authenticated;
grant execute on function public.request_team_status_json_v2(public.team_requests) to anon, authenticated;
