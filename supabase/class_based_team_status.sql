-- Teamergency MVP: class-based team status for Class Detail and Lecturer Dashboard.
-- Safe additive migration. It does not drop tables, reset data, or delete records.

create index if not exists team_requests_class_profile_status_idx
on public.team_requests(class_id, profile_id, status);

create or replace function public.get_class_member_team_status(
  p_class_id uuid,
  p_profile_id uuid
)
returns table(
  profile_id uuid,
  active_request_id uuid,
  request_status text,
  status_label text,
  found_count integer,
  total_team_size integer,
  remaining_teammates integer,
  matched_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with membership as (
    select cm.profile_id, cm.network_status
    from public.class_members cm
    where cm.class_id = p_class_id
      and cm.profile_id = p_profile_id
    limit 1
  ),
  selected_request as (
    select tr.*
    from public.team_requests tr
    where tr.class_id = p_class_id
      and tr.profile_id = p_profile_id
      and tr.status in ('looking', 'found')
    order by
      case when tr.status = 'looking' then 0 else 1 end,
      tr.created_at desc
    limit 1
  ),
  matched as (
    select distinct
      case
        when c.sender_profile_id = p_profile_id then c.receiver_profile_id
        else c.sender_profile_id
      end as teammate_profile_id
    from public.connections c
    join selected_request sr on (
      (c.sender_profile_id = p_profile_id and c.sender_team_request_id = sr.id)
      or (c.receiver_profile_id = p_profile_id and c.receiver_team_request_id = sr.id)
    )
    where c.status = 'accepted'
      and c.relationship_type = 'teammate'
      and p_profile_id in (c.sender_profile_id, c.receiver_profile_id)
  ),
  metrics as (
    select
      sr.id as request_id,
      sr.status,
      greatest(1, coalesce(sr.total_team_size, sr.members_needed + 1, 1))::integer as total_size,
      greatest(0, coalesce(sr.total_team_size, sr.members_needed + 1, 1) - coalesce(sr.teammates_needed_initial, sr.members_needed, 1))::integer as existing_members,
      count(m.teammate_profile_id)::integer as matched_members
    from selected_request sr
    left join matched m on true
    group by sr.id, sr.status, sr.total_team_size, sr.members_needed, sr.teammates_needed_initial
  ),
  resolved as (
    select
      m.profile_id,
      metrics.request_id,
      metrics.status,
      case
        when metrics.request_id is null and m.network_status = 'already_have_team'
          then 'You already have a complete team'
        when metrics.request_id is null
          then 'No request / not looking'
        when metrics.status = 'found'
          then 'Team complete'
        when least(metrics.total_size, metrics.existing_members + metrics.matched_members) >= metrics.total_size
          then 'Team complete'
        when least(metrics.total_size, metrics.existing_members + metrics.matched_members) <= 1
          then 'Looking for teammates'
        when greatest(0, metrics.total_size - least(metrics.total_size, metrics.existing_members + metrics.matched_members)) = 1
          then 'Missing 1 teammate'
        else 'Missing ' || greatest(0, metrics.total_size - least(metrics.total_size, metrics.existing_members + metrics.matched_members))::text || ' teammates'
      end as label,
      case
        when metrics.request_id is null and m.network_status = 'already_have_team'
          then 1
        when metrics.request_id is null
          then 0
        else least(metrics.total_size, metrics.existing_members + metrics.matched_members)
      end::integer as found_members,
      coalesce(metrics.total_size, case when m.network_status = 'already_have_team' then 1 else 0 end)::integer as required_members,
      case
        when metrics.request_id is null then 0
        else greatest(0, metrics.total_size - least(metrics.total_size, metrics.existing_members + metrics.matched_members))
      end::integer as missing_members,
      coalesce(metrics.matched_members, 0)::integer as matched_members
    from membership m
    left join metrics on true
  )
  select
    resolved.profile_id,
    resolved.request_id,
    resolved.status,
    resolved.label,
    resolved.found_members,
    resolved.required_members,
    resolved.missing_members,
    resolved.matched_members
  from resolved;
$$;

create or replace function public.demo_class_dashboard_row(target_class uuid)
returns table(
  id uuid,
  university text,
  school text,
  major text,
  course_name text,
  course_code text,
  session_code text,
  semester text,
  academic_year integer,
  lecturer_name text,
  lecturer_id text,
  class_code text,
  join_code text,
  status text,
  total_students integer,
  students_looking integer,
  students_in_teams integer,
  students_without_team integer,
  teams_formed integer,
  formation_rate numeric,
  average_match_usefulness numeric,
  network_status_counts jsonb,
  students jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select c.*
    from public.classes c
    where c.id = target_class
      and c.is_demo = true
      and c.status = 'active'
  ),
  members as (
    select
      cm.profile_id,
      cm.network_status,
      p.full_name,
      p.major as student_major,
      mts.active_request_id,
      mts.request_status,
      mts.status_label,
      mts.found_count,
      mts.total_team_size,
      mts.remaining_teammates,
      mts.matched_count
    from target c
    join public.class_members cm on cm.class_id = c.id
    join public.profiles p on p.id = cm.profile_id
    left join lateral public.get_class_member_team_status(c.id, cm.profile_id) mts on true
  ),
  totals as (
    select
      count(*)::integer as total_students,
      count(*) filter (
        where status_label in ('Looking for teammates', 'Missing 1 teammate')
          or status_label like 'Missing % teammates'
      )::integer as students_looking,
      count(*) filter (
        where status_label in ('Team complete', 'You already have a complete team')
      )::integer as students_in_teams,
      count(*) filter (
        where status_label not in ('Team complete', 'You already have a complete team')
      )::integer as students_without_team
    from members
  )
  select
    c.id,
    c.university,
    c.school,
    c.major,
    c.course_name,
    c.course_code,
    c.session_code,
    c.semester,
    c.academic_year,
    c.lecturer_name,
    c.lecturer_id,
    coalesce(c.demo_class_code, c.join_code),
    c.join_code,
    c.status,
    coalesce(t.total_students, 0),
    coalesce(t.students_looking, 0),
    coalesce(t.students_in_teams, 0),
    coalesce(t.students_without_team, 0),
    ceiling(coalesce(t.students_in_teams, 0)::numeric / 2)::integer,
    case
      when coalesce(t.total_students, 0) = 0 then 0
      else round((coalesce(t.students_in_teams, 0)::numeric / t.total_students::numeric) * 100, 1)
    end,
    public.demo_class_average_match_usefulness(c.id),
    coalesce((
      select jsonb_object_agg(coalesce(m.network_status, 'not_answered'), total)
      from (
        select members.network_status, count(*)::integer as total
        from members
        group by members.network_status
      ) m
    ), '{}'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'profile_id', members.profile_id,
          'full_name', members.full_name,
          'major', members.student_major,
          'network_status', members.network_status,
          'status', members.status_label,
          'active_request_id', members.active_request_id,
          'found_count', members.found_count,
          'total_team_size', members.total_team_size,
          'remaining_teammates', members.remaining_teammates,
          'matched_count', members.matched_count
        )
        order by members.full_name
      )
      from members
    ), '[]'::jsonb)
  from target c
  cross join totals t;
$$;

grant execute on function public.get_class_member_team_status(uuid, uuid) to authenticated;
grant execute on function public.demo_class_dashboard_row(uuid) to authenticated;

create or replace function public.list_my_classes_with_status(current_profile uuid)
returns table(
  id uuid,
  university text,
  school text,
  major text,
  course text,
  course_name text,
  course_code text,
  session_code text,
  class_session text,
  semester text,
  academic_year integer,
  lecturer_name text,
  lecturer_id text,
  class_code text,
  join_code text,
  status text,
  is_demo boolean,
  network_status text,
  joined_at timestamptz,
  active_request_id uuid,
  team_status text,
  found_count integer,
  total_team_size integer,
  remaining_teammates integer,
  matched_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.university,
    c.school,
    c.major,
    c.course,
    c.course_name,
    c.course_code,
    c.session_code,
    c.class_session,
    c.semester,
    c.academic_year,
    c.lecturer_name,
    c.lecturer_id,
    coalesce(c.demo_class_code, c.join_code),
    c.join_code,
    c.status,
    c.is_demo,
    cm.network_status,
    cm.joined_at,
    mts.active_request_id,
    mts.status_label,
    mts.found_count,
    mts.total_team_size,
    mts.remaining_teammates,
    mts.matched_count
  from public.class_members cm
  join public.classes c on c.id = cm.class_id
  left join lateral public.get_class_member_team_status(c.id, cm.profile_id) mts on true
  where cm.profile_id = current_profile
    and public.owns_profile(current_profile)
  order by cm.joined_at desc;
$$;

grant execute on function public.list_my_classes_with_status(uuid) to authenticated;
