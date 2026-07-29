delete from public.profiles where is_demo = true;

with demo_profiles as (
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
  values
    ('Alex Nguyen (Demo)', 'SCD', 'Digital Media', array['JavaScript', 'TouchDesigner', 'Creative Coding'], 'instagram', null, 'Demo profile for testing high-fit interactive media teammate matching.', true),
    ('Mina Tran (Demo)', 'SCD', 'Digital Media', array['Photography', 'UI/UX', 'Figma'], 'email', null, 'Demo profile for testing visual design and documentation collaboration.', true),
    ('Bao Le (Demo)', 'SSET', 'Software Engineering', array['React', 'Node.js', 'Supabase'], 'messenger', null, 'Demo profile for testing web programming matches.', true),
    ('Linh Pham (Demo)', 'SCD', 'Design Studies', array['Figma', 'Graphic Design', 'Illustration'], 'instagram', null, 'Demo profile for design-focused teammate searches.', true),
    ('Huy Vo (Demo)', 'SCD', 'Design Studies', array['UI/UX', 'User Research', 'Presentation'], 'url', null, 'Demo profile for service design and research-heavy teams.', true),
    ('Mai Hoang (Demo)', 'TBS', 'Marketing', array['Content Creation', 'Social Media', 'Video Editing'], 'email', null, 'Demo profile for marketing campaign collaboration.', true),
    ('Khoa Bui (Demo)', 'SSET', 'Computer Science', array['Python', 'Data Visualization', 'APIs'], 'messenger', null, 'Demo profile for data storytelling and technical prototypes.', true),
    ('Vy Dang (Demo)', 'SCD', 'Digital Film and Video', array['Videography', 'Video Editing', 'Sound Design'], 'instagram', null, 'Demo profile for video and storytelling projects.', true),
    ('Nam Phan (Demo)', 'SSET', 'Software Engineering', array['JavaScript', 'Creative Coding', 'HTML/CSS'], 'email', null, 'Demo profile for interactive web experiments.', true),
    ('Thao Nguyen (Demo)', 'SCD', 'Design Studies', array['3D Modelling', 'Blender', 'Presentation'], 'url', null, 'Demo profile for spatial and 3D concept pitches.', true),
    ('Duc Lam (Demo)', 'SCD', 'Digital Media', array['TouchDesigner', 'Projection Mapping', 'Arduino'], 'instagram', null, 'Demo profile for installation and sensor-based media projects.', true),
    ('Quynh Tran (Demo)', 'TBS', 'Business Analytics', array['Research', 'Presentation', 'Data Visualization'], 'email', null, 'Demo profile for market research and insight summaries.', true),
    ('Nhi Do (Demo)', 'SCD', 'Professional Communication', array['Writing', 'Project Management', 'Research'], 'messenger', null, 'Demo profile for communication and coordination-heavy teams.', true),
    ('Tuan Huynh (Demo)', 'SSET', 'Information Technology', array['Backend', 'Database Design', 'Supabase'], 'url', null, 'Demo profile for database and backend support.', true),
    ('Yen Mai (Demo)', 'SCD', 'Professional Communication', array['Photography', 'Content Creation', 'Social Media'], 'instagram', null, 'Demo profile for content planning and visual production.', true)
  returning id, full_name
),
demo_requests (
  full_name,
  course_name,
  course_code,
  skills_needed,
  members_needed,
  availability,
  preferred_active_time,
  work_style,
  requirements
) as (
  values
    ('Alex Nguyen (Demo)', 'Digital Media Studio 4', 'COMM2784', array['Photography', 'UI/UX'], 2, array['Wednesday', 'Friday'], 'evening', 'Collaborative', 'Demo request designed to match DMS4 interactive media scenarios.'),
    ('Mina Tran (Demo)', 'Digital Media Studio 4', 'COMM2784', array['JavaScript', 'TouchDesigner'], 1, array['Tuesday', 'Thursday'], 'afternoon', 'Organised', 'Demo request designed to complement technical DMS4 teams.'),
    ('Bao Le (Demo)', 'Web Programming', 'COSC2430', array['UI/UX', 'Figma'], 2, array['Monday', 'Wednesday'], 'evening', 'Takes initiative', 'Demo request for frontend/backend split testing.'),
    ('Linh Pham (Demo)', 'Brand Identity Studio', 'COMM2762', array['Research', 'Writing'], 1, array['Friday', 'Sunday'], 'morning', 'Organised', 'Demo design teammate request.'),
    ('Huy Vo (Demo)', 'Service Design', 'ISYS2101', array['Data Visualization', 'Research'], 3, array['Tuesday', 'Saturday'], 'afternoon', 'Collaborative', 'Demo request for service design testing.'),
    ('Mai Hoang (Demo)', 'Integrated Marketing Campaign', 'MKTG2301', array['Graphic Design', 'Video Editing'], 2, array['Monday', 'Thursday'], 'evening', 'Communicates frequently', 'Demo marketing campaign request.'),
    ('Khoa Bui (Demo)', 'Data Storytelling', 'BUSM2655', array['Presentation', 'Writing'], 1, array['Wednesday', 'Saturday'], 'morning', 'Organised', 'Demo data storytelling request.'),
    ('Vy Dang (Demo)', 'Digital Media Studio 4', 'COMM2784', array['TouchDesigner', 'Creative Coding'], 2, array['Wednesday', 'Friday'], 'evening', 'Collaborative', 'Demo high-match DMS4 media request.'),
    ('Nam Phan (Demo)', 'Creative Coding', 'COMM2778', array['Motion Graphics', 'Sound Design'], 1, array['Tuesday', 'Friday'], 'evening', 'Takes initiative', 'Demo creative coding request.'),
    ('Thao Nguyen (Demo)', 'Creative Coding', 'COMM2778', array['Projection Mapping', 'Photography'], 2, array['Saturday', 'Sunday'], 'morning', 'Flexible with changes', 'Demo 3D and exhibition request.'),
    ('Duc Lam (Demo)', 'Digital Media Studio 4', 'COMM2784', array['JavaScript', 'UI/UX'], 1, array['Wednesday', 'Sunday'], 'afternoon', 'Takes initiative', 'Demo DMS4 technical media request.'),
    ('Quynh Tran (Demo)', 'Market Research', 'MKTG2305', array['Writing', 'Presentation'], 2, array['Monday', 'Wednesday'], 'afternoon', 'Works steadily throughout the project', 'Demo research request.'),
    ('Nhi Do (Demo)', 'Public Relations Planning', 'COMM2825', array['Content Creation', 'Photography'], 1, array['Thursday', 'Sunday'], 'evening', 'Communicates frequently', 'Demo PR request.'),
    ('Tuan Huynh (Demo)', 'Web Programming', 'COSC2430', array['React', 'UI/UX'], 2, array['Tuesday', 'Saturday'], 'evening', 'Organised', 'Demo web programming request.'),
    ('Yen Mai (Demo)', 'Digital Storytelling', 'COMM2750', array['Video Editing', 'Writing'], 1, array['Friday', 'Sunday'], 'morning', 'Collaborative', 'Demo storytelling production request.')
)
insert into public.team_requests (
  profile_id,
  course,
  course_name,
  course_code,
  skills_needed,
  members_needed,
  availability,
  preferred_active_time,
  work_style,
  requirements,
  status,
  edit_token
)
select
  demo_profiles.id,
  demo_requests.course_name,
  demo_requests.course_name,
  demo_requests.course_code,
  demo_requests.skills_needed,
  demo_requests.members_needed,
  demo_requests.availability,
  demo_requests.preferred_active_time,
  demo_requests.work_style,
  demo_requests.requirements,
  'looking',
  encode(gen_random_bytes(32), 'hex')
from demo_requests
join demo_profiles on demo_profiles.full_name = demo_requests.full_name;

update public.team_requests tr
set
  school = p.school,
  major = p.major,
  class_session = case tr.course
    when 'Digital Media Studio 4' then 'Tuesday 09:30'
    when 'Digital Storytelling' then 'Tuesday 13:30'
    when 'Web Programming' then 'Tuesday 13:30'
    when 'Brand Identity Studio' then 'Wednesday 09:30'
    when 'Service Design' then 'Thursday 09:30'
    when 'Integrated Marketing Campaign' then 'Tuesday 09:30'
    when 'Data Storytelling' then 'Monday 13:30'
    when 'Creative Coding' then 'Monday 13:30'
    when 'Public Relations Planning' then 'Monday 09:30'
    else 'Not specified'
  end,
  work_styles = case tr.work_style
    when 'Collaborative' then array['Enjoys collaborative work', 'Communicates frequently']
    when 'Organised' then array['Organised and structured', 'Works steadily throughout the project']
    when 'Takes initiative' then array['Takes initiative', 'Likes to finish tasks early']
    when 'Communicates frequently' then array['Communicates frequently', 'Enjoys collaborative work']
    else array['Flexible with changes']
  end
from public.profiles p
where tr.profile_id = p.id
  and p.is_demo = true;
