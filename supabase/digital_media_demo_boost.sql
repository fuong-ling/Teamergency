create extension if not exists pgcrypto with schema extensions;

with demo_profiles_data (
  full_name,
  school,
  major,
  skills,
  contact_type,
  contact_value,
  short_bio,
  is_demo
) as (
  values
    ('Jamie Vo', 'SCD', 'Digital Media', array['Photography', 'Videography', 'Video Editing'], 'instagram', null, 'Demo profile for DMS4 visual production teammate testing.', true),
    ('Gia Phan', 'SCD', 'Digital Media', array['UI/UX', 'Figma', 'Graphic Design'], 'email', null, 'Demo profile for DMS4 interface and presentation teammate testing.', true),
    ('Owen Tran', 'SCD', 'Digital Media', array['TouchDesigner', 'Creative Coding', 'Projection Mapping'], 'messenger', null, 'Demo profile for DMS4 interactive installation teammate testing.', true),
    ('Hana Le', 'SCD', 'Digital Media', array['Motion Graphics', 'After Effects', 'Video Editing'], 'instagram', null, 'Demo profile for DMS4 motion and post-production teammate testing.', true),
    ('Ryan Ho', 'SCD', 'Digital Media', array['JavaScript', 'HTML/CSS', 'Creative Coding'], 'url', null, 'Demo profile for DMS4 web prototype teammate testing.', true),
    ('Ellie Dang', 'SCD', 'Digital Media', array['Content Creation', 'Research', 'Presentation'], 'email', null, 'Demo profile for DMS4 concept and documentation teammate testing.', true)
),
inserted_profiles as (
  insert into public.profiles (
    full_name,
    school,
    major,
    skills,
    contact_type,
    contact_value,
    short_bio,
    is_demo
  )
  select
    d.full_name,
    d.school,
    d.major,
    d.skills,
    d.contact_type,
    d.contact_value,
    d.short_bio,
    d.is_demo
  from demo_profiles_data d
  where not exists (
    select 1
    from public.profiles p
    where p.full_name = d.full_name
      and p.is_demo = true
  )
  returning id, full_name
),
demo_profiles as (
  select id, full_name
  from inserted_profiles
  union
  select p.id, p.full_name
  from public.profiles p
  join demo_profiles_data d on d.full_name = p.full_name
  where p.is_demo = true
),
demo_requests (
  full_name,
  class_session,
  skills_needed,
  members_needed,
  work_styles,
  requirements
) as (
  values
    ('Jamie Vo', 'Tuesday 09:30', array['UI/UX', 'Creative Coding'], 2, array['Enjoys collaborative work', 'Communicates frequently'], 'Demo DMS4 request for visual production matches.'),
    ('Gia Phan', 'Thursday 13:30', array['Photography', 'TouchDesigner'], 1, array['Organised and structured', 'Takes initiative'], 'Demo DMS4 request for interface and visual design matches.'),
    ('Owen Tran', 'Friday 09:30', array['Video Editing', 'Presentation'], 2, array['Flexible with changes', 'Enjoys collaborative work'], 'Demo DMS4 request for interactive media matches.'),
    ('Hana Le', 'Tuesday 13:30', array['JavaScript', 'TouchDesigner'], 1, array['Works steadily throughout the project'], 'Demo DMS4 request for motion media matches.'),
    ('Ryan Ho', 'Wednesday 09:30', array['UI/UX', 'Content Creation'], 2, array['Likes to finish tasks early', 'Takes initiative'], 'Demo DMS4 request for web prototype matches.'),
    ('Ellie Dang', 'Thursday 09:30', array['Video Editing', 'Motion Graphics'], 1, array['Communicates frequently', 'Organised and structured'], 'Demo DMS4 request for concept and documentation matches.')
)
insert into public.team_requests (
  profile_id,
  school,
  major,
  course,
  course_name,
  course_code,
  class_session,
  skills_needed,
  members_needed,
  work_styles,
  requirements,
  status,
  edit_token
)
select
  p.id,
  'SCD',
  'Digital Media',
  'Digital Media Studio 4',
  'Digital Media Studio 4',
  'COMM2784',
  r.class_session,
  r.skills_needed,
  r.members_needed,
  r.work_styles,
  r.requirements,
  'looking',
  encode(extensions.gen_random_bytes(32), 'hex')
from demo_requests r
join demo_profiles p on p.full_name = r.full_name
where not exists (
  select 1
  from public.team_requests tr
  where tr.profile_id = p.id
    and tr.course_code = 'COMM2784'
    and tr.class_session = r.class_session
    and tr.status = 'looking'
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'team_requests'
      and column_name = 'total_team_size'
  ) then
    update public.team_requests tr
    set
      total_team_size = greatest(tr.members_needed + 1, 2),
      teammates_needed_initial = tr.members_needed
    from public.profiles p
    where p.id = tr.profile_id
      and p.is_demo = true
      and tr.course_code = 'COMM2784'
      and tr.major = 'Digital Media';
  end if;
end;
$$;
