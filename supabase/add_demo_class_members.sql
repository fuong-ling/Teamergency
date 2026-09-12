-- Teamergency demo data: populate a few existing classes with same-class demos.
--
-- No classes are created. Existing class metadata and team-size settings are
-- read from the selected class/request rows. This file only adds demo links
-- and class-scoped demo requests. Review and run manually in Supabase.

begin;

with demo_members (demo_class_code, school, full_name, university, network_status) as (
  values
    ('200206', 'SCD', 'Maya Pham', 'RMIT University', 'need_some_teammates'),
    ('200206', 'SCD', 'Ari Nguyen', 'RMIT University', 'no_preferred_teammates'),
    ('676767', 'SCD', 'Thu Nguyen', 'University of Economics Ho Chi Minh City', 'need_some_teammates'),
    ('676767', 'SCD', 'Lan Tran', 'University of Economics Ho Chi Minh City', 'no_preferred_teammates'),
    ('88889999', 'SCD', 'An Le', 'University of Technology Ho Chi Minh City', 'need_some_teammates'),
    ('88889999', 'SCD', 'Bao Pham', 'University of Technology Ho Chi Minh City', 'no_preferred_teammates')
),
resolved as (
  select c.id as class_id, p.id as profile_id, dm.network_status
  from demo_members dm
  join public.classes c
    on c.is_demo = true
   and c.demo_class_code = dm.demo_class_code
   and c.school = dm.school
   and lower(trim(c.university)) = lower(trim(dm.university))
  join public.profiles p
    on p.is_demo = true
   and lower(trim(p.full_name)) = lower(trim(dm.full_name))
   and lower(trim(coalesce(p.university, ''))) = lower(trim(dm.university))
)
insert into public.class_members (class_id, profile_id, network_status)
select class_id, profile_id, network_status
from resolved
on conflict (class_id, profile_id)
do update set network_status = excluded.network_status;

with assignments (demo_class_code, school, full_name, university) as (
  values
    ('200206', 'SCD', 'Maya Pham', 'RMIT University'),
    ('200206', 'SCD', 'Ari Nguyen', 'RMIT University'),
    ('676767', 'SCD', 'Thu Nguyen', 'University of Economics Ho Chi Minh City'),
    ('676767', 'SCD', 'Lan Tran', 'University of Economics Ho Chi Minh City'),
    ('88889999', 'SCD', 'An Le', 'University of Technology Ho Chi Minh City'),
    ('88889999', 'SCD', 'Bao Pham', 'University of Technology Ho Chi Minh City')
),
resolved_requests as (
  select
    c.id as class_id,
    p.id as profile_id,
    c.school,
    c.major,
    c.course,
    c.course_name,
    c.course_code,
    c.class_session,
    p.skills,
    tr_settings.total_team_size
  from assignments a
  join public.classes c
    on c.is_demo = true
   and c.demo_class_code = a.demo_class_code
   and c.school = a.school
   and lower(trim(c.university)) = lower(trim(a.university))
  join public.profiles p
    on p.is_demo = true
   and lower(trim(p.full_name)) = lower(trim(a.full_name))
   and lower(trim(coalesce(p.university, ''))) = lower(trim(a.university))
  left join lateral (
    select
      coalesce(tr.total_team_size, tr.members_needed + 1) as total_team_size
    from public.team_requests tr
    where tr.class_id = c.id
      and tr.status = 'looking'
    order by tr.created_at desc
    limit 1
  ) tr_settings on true
)
insert into public.team_requests (
  profile_id,
  class_id,
  school,
  major,
  course,
  course_name,
  course_code,
  class_session,
  skills_needed,
  members_needed,
  total_team_size,
  teammates_needed_initial,
  baseline_member_count,
  work_styles,
  requirements,
  status,
  edit_token
)
select
  r.profile_id,
  r.class_id,
  r.school,
  r.major,
  r.course,
  r.course_name,
  r.course_code,
  r.class_session,
  r.skills,
  greatest(1, coalesce(r.total_team_size, 2) - 1),
  coalesce(r.total_team_size, 2),
  greatest(1, coalesce(r.total_team_size, 2) - 1),
  1,
  array['Enjoys collaborative work', 'Communicates frequently']::text[],
  'Demo class request using the selected class metadata and existing matching rules.',
  'looking',
  encode(extensions.gen_random_bytes(32), 'hex')
from resolved_requests r
where not exists (
  select 1
  from public.team_requests existing
  where existing.profile_id = r.profile_id
    and existing.class_id = r.class_id
    and existing.status = 'looking'
);

commit;
