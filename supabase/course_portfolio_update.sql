alter table public.team_requests
add column if not exists course_name text;

alter table public.team_requests
add column if not exists course_code text;

alter table public.team_requests
add column if not exists requires_portfolio boolean not null default false;

alter table public.team_requests
add column if not exists portfolio_reference_path text;

alter table public.team_requests
add column if not exists portfolio_reference_name text;

update public.team_requests tr
set school = case
  when p.school in ('SCD', 'TBS', 'SSET') then p.school
  else null
end
from public.profiles p
where tr.profile_id = p.id
  and (tr.school is null or tr.school not in ('SCD', 'TBS', 'SSET'));

update public.team_requests
set
  course_name = coalesce(course_name, course),
  course_code = coalesce(
    course_code,
    case
      when course = 'Digital Media Studio 4' then 'COMM2784'
      when course = 'Digital Storytelling' then 'COMM2750'
      when course = 'Creative Coding' and school = 'SSET' then 'COSC2818'
      when course = 'Creative Coding' then 'COMM2778'
      when course = 'Brand Identity Studio' then 'COMM2762'
      when course = 'Public Relations Planning' then 'COMM2825'
      when course = 'Integrated Marketing Campaign' then 'MKTG2301'
      when course = 'Market Research' then 'MKTG2305'
      when course = 'Data Storytelling' then 'BUSM2655'
      when course = 'Web Programming' then 'COSC2430'
      when course = 'Service Design' then 'ISYS2101'
      else null
    end
  )
where course_name is null
   or course_code is null;

create index if not exists team_requests_course_code_idx on public.team_requests(course_code);
create index if not exists team_requests_course_name_idx on public.team_requests(lower(course_name));
create index if not exists team_requests_requires_portfolio_idx on public.team_requests(requires_portfolio);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'request-portfolios',
  'request-portfolios',
  true,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anon can read request portfolio references" on storage.objects;
create policy "Anon can read request portfolio references"
on storage.objects
for select
to anon
using (bucket_id = 'request-portfolios');

drop policy if exists "Anon can upload request portfolio references" on storage.objects;
create policy "Anon can upload request portfolio references"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'request-portfolios'
  and lower(name) ~ '\.(pdf|png|jpg|jpeg)$'
);

drop function if exists public.list_connection_requests(uuid, text);

create or replace function public.list_connection_requests(
  current_profile uuid,
  direction text
)
returns table(
  id uuid,
  sender_profile_id uuid,
  receiver_profile_id uuid,
  sender_team_request_id uuid,
  intro_message text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  teammate_profile_id uuid,
  teammate_full_name text,
  teammate_school text,
  teammate_major text,
  teammate_skills text[],
  course text,
  course_name text,
  course_code text,
  class_session text,
  skills_needed text[],
  work_styles text[],
  members_needed integer
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.sender_profile_id,
    c.receiver_profile_id,
    c.sender_team_request_id,
    c.intro_message,
    c.status,
    c.created_at,
    c.updated_at,
    case when direction = 'incoming' then c.sender_profile_id else c.receiver_profile_id end as teammate_profile_id,
    p.full_name as teammate_full_name,
    p.school as teammate_school,
    p.major as teammate_major,
    p.skills as teammate_skills,
    tr.course,
    tr.course_name,
    tr.course_code,
    tr.class_session,
    tr.skills_needed,
    tr.work_styles,
    tr.members_needed
  from public.connections c
  join public.profiles p
    on p.id = case when direction = 'incoming' then c.sender_profile_id else c.receiver_profile_id end
  left join public.team_requests tr on tr.id = c.sender_team_request_id
  where (
      direction = 'incoming'
      and c.receiver_profile_id = current_profile
      and c.status = 'pending'
    )
    or (
      direction = 'sent'
      and c.sender_profile_id = current_profile
      and c.status in ('pending', 'accepted', 'declined', 'cancelled')
    )
  order by c.updated_at desc;
$$;

grant execute on function public.list_connection_requests(uuid, text) to anon;
