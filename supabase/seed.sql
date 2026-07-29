create extension if not exists pgcrypto with schema extensions;

update public.profiles
set full_name = regexp_replace(full_name, '\s*\(Demo\)\s*$', '', 'i')
where is_demo = true
  and full_name ~* '\s*\(Demo\)\s*$';

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
    ('Alex Nguyen', 'SCD', 'Digital Media', array['JavaScript', 'TouchDesigner', 'Creative Coding'], 'instagram', null, 'Demo profile for testing high-fit interactive media teammate matching.', true),
    ('Mina Tran', 'SCD', 'Digital Media', array['Photography', 'UI/UX', 'Figma'], 'email', null, 'Demo profile for testing visual design and documentation collaboration.', true),
    ('Bao Le', 'SSET', 'Software Engineering', array['React', 'Node.js', 'Supabase'], 'messenger', null, 'Demo profile for testing web programming matches.', true),
    ('Linh Pham', 'SCD', 'Design Studies', array['Figma', 'Graphic Design', 'Illustration'], 'instagram', null, 'Demo profile for design-focused teammate searches.', true),
    ('Huy Vo', 'SCD', 'Design Studies', array['UI/UX', 'User Research', 'Presentation'], 'url', null, 'Demo profile for service design and research-heavy teams.', true),
    ('Mai Hoang', 'TBS', 'Marketing', array['Content Creation', 'Social Media', 'Video Editing'], 'email', null, 'Demo profile for marketing campaign collaboration.', true),
    ('Khoa Bui', 'SSET', 'Computer Science', array['Python', 'Data Visualization', 'APIs'], 'messenger', null, 'Demo profile for data storytelling and technical prototypes.', true),
    ('Vy Dang', 'SCD', 'Digital Film and Video', array['Videography', 'Video Editing', 'Sound Design'], 'instagram', null, 'Demo profile for video and storytelling projects.', true),
    ('Nam Phan', 'SSET', 'Software Engineering', array['JavaScript', 'Creative Coding', 'HTML/CSS'], 'email', null, 'Demo profile for interactive web experiments.', true),
    ('Thao Nguyen', 'SCD', 'Design Studies', array['3D Modelling', 'Blender', 'Presentation'], 'url', null, 'Demo profile for spatial and 3D concept pitches.', true),
    ('Duc Lam', 'SCD', 'Digital Media', array['TouchDesigner', 'Projection Mapping', 'Arduino'], 'instagram', null, 'Demo profile for installation and sensor-based media projects.', true),
    ('Quynh Tran', 'TBS', 'Business Analytics', array['Research', 'Presentation', 'Data Visualization'], 'email', null, 'Demo profile for market research and insight summaries.', true),
    ('Nhi Do', 'SCD', 'Professional Communication', array['Writing', 'Project Management', 'Research'], 'messenger', null, 'Demo profile for communication and coordination-heavy teams.', true),
    ('Tuan Huynh', 'SSET', 'Information Technology', array['Backend', 'Database Design', 'Supabase'], 'url', null, 'Demo profile for database and backend support.', true),
    ('Yen Mai', 'SCD', 'Professional Communication', array['Photography', 'Content Creation', 'Social Media'], 'instagram', null, 'Demo profile for content planning and visual production.', true)
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
  school,
  major,
  course_name,
  course_code,
  class_session,
  skills_needed,
  members_needed,
  work_styles,
  requirements
) as (
  values
    ('Alex Nguyen', 'SCD', 'Digital Media', 'Digital Media Studio 4', 'COMM2784', 'Tuesday 09:30', array['Photography', 'UI/UX'], 2, array['Enjoys collaborative work', 'Communicates frequently'], 'Demo request designed to match DMS4 interactive media scenarios.'),
    ('Mina Tran', 'SCD', 'Digital Media', 'Digital Media Studio 4', 'COMM2784', 'Thursday 13:30', array['JavaScript', 'TouchDesigner'], 1, array['Organised and structured', 'Works steadily throughout the project'], 'Demo request designed to complement technical DMS4 teams.'),
    ('Bao Le', 'SSET', 'Software Engineering', 'Web Programming', 'COSC2430', 'Tuesday 13:30', array['UI/UX', 'Figma'], 2, array['Takes initiative', 'Likes to finish tasks early'], 'Demo request for frontend/backend split testing.'),
    ('Linh Pham', 'SCD', 'Design Studies', 'Brand Identity Studio', 'COMM2762', 'Wednesday 09:30', array['Research', 'Writing'], 1, array['Organised and structured'], 'Demo design teammate request.'),
    ('Huy Vo', 'SCD', 'Design Studies', 'Service Design', 'ISYS2101', 'Thursday 09:30', array['Data Visualization', 'Research'], 3, array['Enjoys collaborative work'], 'Demo request for service design testing.'),
    ('Mai Hoang', 'TBS', 'Marketing', 'Integrated Marketing Campaign', 'MKTG2301', 'Tuesday 09:30', array['Graphic Design', 'Video Editing'], 2, array['Communicates frequently'], 'Demo marketing campaign request.'),
    ('Khoa Bui', 'TBS', 'Business Analytics', 'Data Storytelling', 'BUSM2655', 'Monday 13:30', array['Presentation', 'Writing'], 1, array['Organised and structured'], 'Demo data storytelling request.'),
    ('Vy Dang', 'SCD', 'Digital Film and Video', 'Digital Media Studio 4', 'COMM2784', 'Friday 09:30', array['TouchDesigner', 'Creative Coding'], 2, array['Enjoys collaborative work'], 'Demo high-match DMS4 media request.'),
    ('Nam Phan', 'SSET', 'Software Engineering', 'Creative Coding', 'COSC2818', 'Monday 13:30', array['Motion Graphics', 'Sound Design'], 1, array['Takes initiative'], 'Demo creative coding request.'),
    ('Thao Nguyen', 'SCD', 'Design Studies', 'Creative Coding', 'COMM2778', 'Friday 13:30', array['Projection Mapping', 'Photography'], 2, array['Flexible with changes'], 'Demo 3D and exhibition request.'),
    ('Duc Lam', 'SCD', 'Digital Media', 'Digital Media Studio 4', 'COMM2784', 'Tuesday 09:30', array['JavaScript', 'UI/UX'], 1, array['Takes initiative'], 'Demo DMS4 technical media request.'),
    ('Quynh Tran', 'TBS', 'Business Analytics', 'Market Research', 'MKTG2305', 'Wednesday 13:30', array['Writing', 'Presentation'], 2, array['Works steadily throughout the project'], 'Demo research request.'),
    ('Nhi Do', 'SCD', 'Professional Communication', 'Public Relations Planning', 'COMM2825', 'Monday 09:30', array['Content Creation', 'Photography'], 1, array['Communicates frequently'], 'Demo PR request.'),
    ('Tuan Huynh', 'SSET', 'Information Technology', 'Web Programming', 'COSC2430', 'Saturday 09:30', array['React', 'UI/UX'], 2, array['Organised and structured'], 'Demo web programming request.'),
    ('Yen Mai', 'SCD', 'Professional Communication', 'Digital Storytelling', 'COMM2750', 'Tuesday 13:30', array['Video Editing', 'Writing'], 1, array['Enjoys collaborative work'], 'Demo storytelling production request.')
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
  r.school,
  r.major,
  r.course_name,
  r.course_name,
  r.course_code,
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
    and tr.course_code = r.course_code
    and tr.class_session = r.class_session
    and tr.status = 'looking'
);
