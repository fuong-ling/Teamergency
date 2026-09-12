-- Teamergency demo data: profiles covering every built-in university option.
--
-- Data-only and additive. No schema, policy, function, matching, or real-user
-- data is changed. Review and run manually in Supabase.

begin;

with demo_profiles_data (
  full_name, university, school, major, skills, contact_type, short_bio, is_demo
) as (
  values
    ('Maya Pham', 'RMIT University', 'SCD', 'Digital Media',
      array['UI/UX', 'Figma', 'Creative Coding']::text[], 'instagram',
      'Demo profile for visual and interactive media teammate matching.', true),
    ('Leo Tran', 'RMIT University', 'TBS', 'Business',
      array['Business Strategy', 'Presentation', 'Market Research']::text[], 'email',
      'Demo profile for business-focused collaboration matching.', true),
    ('Ari Nguyen', 'RMIT University', 'SCD', 'Digital Media',
      array['Photography', 'Figma', 'Presentation']::text[], 'messenger',
      'Demo profile for visual production collaboration at RMIT.', true),
    ('Thu Nguyen', 'University of Economics Ho Chi Minh City', 'SCD', 'Design Studies',
      array['Graphic Design', 'Figma', 'Research']::text[], 'messenger',
      'Demo profile for design research and presentation teams.', true),
    ('Quang Vo', 'University of Economics Ho Chi Minh City', 'SSET', 'Software Engineering',
      array['JavaScript', 'React', 'Supabase']::text[], 'url',
      'Demo profile for web application teammate matching.', true),
    ('Lan Tran', 'University of Economics Ho Chi Minh City', 'SCD', 'Design Studies',
      array['UI/UX', 'Graphic Design', 'Presentation']::text[], 'email',
      'Demo profile for design collaboration at UEH.', true),
    ('An Le', 'University of Technology Ho Chi Minh City', 'SCD', 'Digital Film and Video',
      array['Videography', 'Video Editing', 'Sound Design']::text[], 'instagram',
      'Demo profile for video production collaboration.', true),
    ('Vy Pham', 'University of Technology Ho Chi Minh City', 'SSET', 'Computer Science',
      array['Python', 'Data Visualization', 'APIs']::text[], 'email',
      'Demo profile for data and technical prototype teams.', true),
    ('Bao Pham', 'University of Technology Ho Chi Minh City', 'SCD', 'Digital Film and Video',
      array['Videography', 'Photography', 'Sound Design']::text[], 'messenger',
      'Demo profile for storytelling collaboration at UTECH.', true),
    ('Kien Dao', 'University of Information Technology', 'SSET', 'Computer Science',
      array['Python', 'React', 'APIs']::text[], 'messenger',
      'Demo profile for technical project matching at UIT.', true),
    ('Nhu Pham', 'University of Information Technology', 'SCD', 'Digital Media',
      array['UI/UX', 'Figma', 'Presentation']::text[], 'instagram',
      'Demo profile for design and product collaboration at UIT.', true),
    ('Hoa Le', 'Foreign Trade University', 'TBS', 'Business',
      array['Market Research', 'Business Strategy', 'Presentation']::text[], 'email',
      'Demo profile for business and research collaboration at FTU.', true),
    ('Minh Pham', 'Foreign Trade University', 'TBS', 'Business Analytics',
      array['Data Visualization', 'Research', 'Excel']::text[], 'url',
      'Demo profile for analytics and insight projects at FTU.', true)
),
inserted as (
  insert into public.profiles (
    full_name, university, school, major, skills, contact_type,
    contact_value, short_bio, is_demo
  )
  select
    d.full_name, d.university, d.school, d.major, d.skills, d.contact_type,
    null, d.short_bio, d.is_demo
  from demo_profiles_data d
  where not exists (
    select 1
    from public.profiles p
    where p.is_demo = true
      and lower(trim(p.full_name)) = lower(trim(d.full_name))
      and lower(trim(coalesce(p.university, ''))) = lower(trim(d.university))
  )
  returning id
)
select count(*) as inserted_demo_profiles
from inserted;

commit;
