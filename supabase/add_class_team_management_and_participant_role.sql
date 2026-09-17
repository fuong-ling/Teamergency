-- Teamergency class-team management and participant role support.
-- MANUAL EXECUTION ONLY. Do not run this file automatically.
--
-- Class enrollment (class_members), class-team membership
-- (class_team_memberships), and friend connections remain separate.

alter table public.profiles
  add column if not exists role text;

update public.profiles
set role = 'student'
where role is null;

alter table public.profiles
  alter column role set default 'student',
  alter column role set not null,
  alter column school drop not null,
  alter column major drop not null,
  alter column contact_type drop not null;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'lecturer', 'participant'));

alter table public.team_requests
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists total_team_size integer,
  add column if not exists teammates_needed_initial integer;

update public.team_requests
set teammates_needed_initial = coalesce(teammates_needed_initial, members_needed, 1),
    total_team_size = coalesce(total_team_size, greatest(coalesce(members_needed, 1) + 1, 2))
where teammates_needed_initial is null
   or total_team_size is null;

create table if not exists public.class_team_memberships (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  team_request_id uuid not null references public.team_requests(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_request_id, profile_id)
);

create table if not exists public.class_team_invites (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  team_request_id uuid not null references public.team_requests(id) on delete cascade,
  inviter_profile_id uuid not null references public.profiles(id) on delete cascade,
  invitee_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (inviter_profile_id <> invitee_profile_id)
);

create unique index if not exists class_team_invites_pending_unique_idx
  on public.class_team_invites(team_request_id, invitee_profile_id)
  where status = 'pending';

create index if not exists class_team_memberships_class_idx
  on public.class_team_memberships(class_id);
create index if not exists class_team_memberships_request_idx
  on public.class_team_memberships(team_request_id);
create index if not exists class_team_memberships_profile_idx
  on public.class_team_memberships(profile_id);
create index if not exists class_team_invites_invitee_idx
  on public.class_team_invites(invitee_profile_id, status);
create index if not exists class_team_invites_request_idx
  on public.class_team_invites(team_request_id, status);

-- Defense in depth for the existing class RPCs: a participant may create
-- ordinary collaboration requests, but cannot enroll in a class or create a
-- class-linked team request through an older SECURITY DEFINER function.
create or replace function public.prevent_participant_class_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.profiles p
    where p.id = new.profile_id
      and p.role = 'participant'
  ) then
    raise exception 'Participants cannot use academic class features.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_participant_class_membership on public.class_members;
create trigger prevent_participant_class_membership
before insert or update on public.class_members
for each row execute function public.prevent_participant_class_mutation();

drop trigger if exists prevent_participant_class_request on public.team_requests;
create trigger prevent_participant_class_request
before insert or update on public.team_requests
for each row
when (new.class_id is not null)
execute function public.prevent_participant_class_mutation();

-- Existing class-team members were historically represented by accepted
-- request-linked connections and/or team_members. Copy them once; the new
-- table is authoritative after this migration.
do $$
begin
  if to_regclass('public.team_members') is not null then
    insert into public.class_team_memberships (class_id, team_request_id, profile_id)
    select tr.class_id, tr.id, tm.teammate_profile_id
    from public.team_members tm
    join public.team_requests tr on tr.id = tm.team_request_id
    where tr.class_id is not null
      and tm.teammate_profile_id <> tr.profile_id
    on conflict (team_request_id, profile_id) do nothing;
  end if;
end;
$$;

insert into public.class_team_memberships (class_id, team_request_id, profile_id)
select
  tr.class_id,
  tr.id,
  case when c.sender_profile_id = tr.profile_id
    then c.receiver_profile_id else c.sender_profile_id end
from public.team_requests tr
join public.connections c
  on c.sender_team_request_id = tr.id
  or c.receiver_team_request_id = tr.id
where tr.class_id is not null
  and c.status = 'accepted'
  and case when c.sender_profile_id = tr.profile_id
    then c.receiver_profile_id else c.sender_profile_id end <> tr.profile_id
on conflict (team_request_id, profile_id) do nothing;

alter table public.class_team_memberships enable row level security;
alter table public.class_team_invites enable row level security;

revoke all on public.class_team_memberships from public, anon, authenticated;
revoke all on public.class_team_invites from public, anon, authenticated;

create or replace function public.get_class_team_members(
  p_class_id uuid,
  p_team_request_id uuid,
  p_profile_id uuid
)
returns table(
  profile_id uuid,
  full_name text,
  university text,
  school text,
  major text,
  skills text[],
  is_owner boolean,
  is_demo boolean,
  connection_id uuid,
  team_request_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  request_owner uuid;
begin
  if not public.owns_profile(p_profile_id) then
    raise exception 'Profile ownership required.';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_profile_id and p.role = 'participant') then
    raise exception 'Participants cannot access class teams.';
  end if;

  select tr.profile_id
    into request_owner
  from public.team_requests tr
  join public.profiles owner_profile on owner_profile.id = tr.profile_id
  where tr.id = p_team_request_id
    and tr.class_id = p_class_id;

  if request_owner is null then
    raise exception 'Class team request was not found.';
  end if;

  if p_profile_id <> request_owner
     and not exists (
       select 1
       from public.class_team_memberships ctm
       where ctm.team_request_id = p_team_request_id
         and ctm.profile_id = p_profile_id
     ) then
    raise exception 'Class team membership required.';
  end if;

  return query
  with visible_members as (
    select
      owner_profile.id as profile_id,
      owner_profile.full_name,
      owner_profile.university,
      owner_profile.school,
      owner_profile.major,
      owner_profile.skills,
      true as is_owner,
      owner_profile.is_demo,
      null::uuid as connection_id,
      p_team_request_id as team_request_id
    from public.profiles owner_profile
    where owner_profile.id = request_owner

    union all

    select
      member_profile.id,
      member_profile.full_name,
      member_profile.university,
      member_profile.school,
      member_profile.major,
      member_profile.skills,
      false,
      member_profile.is_demo,
      connection_match.id,
      p_team_request_id
    from public.class_team_memberships ctm
    join public.profiles member_profile on member_profile.id = ctm.profile_id
    left join lateral (
      select c.id
      from public.connections c
      where c.status = 'accepted'
        and (
          (c.sender_profile_id = request_owner and c.receiver_profile_id = member_profile.id)
          or (c.receiver_profile_id = request_owner and c.sender_profile_id = member_profile.id)
        )
      order by c.updated_at desc nulls last, c.created_at desc
      limit 1
    ) connection_match on true
    where ctm.team_request_id = p_team_request_id
      and ctm.class_id = p_class_id
  )
  select
    visible_members.profile_id,
    visible_members.full_name,
    visible_members.university,
    visible_members.school,
    visible_members.major,
    visible_members.skills,
    visible_members.is_owner,
    visible_members.is_demo,
    visible_members.connection_id,
    visible_members.team_request_id
  from visible_members
  order by visible_members.is_owner desc, lower(coalesce(visible_members.full_name, '')), visible_members.profile_id;
end;
$$;

create or replace function public.list_class_team_invite_candidates(
  p_class_id uuid,
  p_team_request_id uuid,
  p_owner_profile_id uuid
)
returns table(
  profile_id uuid,
  full_name text,
  university text,
  school text,
  major text,
  invite_status text,
  membership_status text,
  eligible boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.owns_profile(p_owner_profile_id) then
    raise exception 'Profile ownership required.';
  end if;

  if exists (select 1 from public.profiles p where p.id = p_owner_profile_id and p.role = 'participant') then
    raise exception 'Participants cannot manage class teams.';
  end if;

  if not exists (
    select 1 from public.team_requests tr
    join public.class_members owner_members on owner_members.class_id = tr.class_id and owner_members.profile_id = tr.profile_id
    where tr.id = p_team_request_id
      and tr.class_id = p_class_id
      and tr.profile_id = p_owner_profile_id
      and tr.status = 'looking'
  ) then
    raise exception 'Only the active class-team owner can invite teammates.';
  end if;

  return query
  with request_row as (
    select tr.id, tr.profile_id, tr.status,
      greatest(coalesce(tr.total_team_size, tr.members_needed + 1), 1) as total_team_size
    from public.team_requests tr
    where tr.id = p_team_request_id and tr.class_id = p_class_id
  ),
  team_size as (
    select count(*)::integer + 1 as current_size
    from public.class_team_memberships ctm
    where ctm.team_request_id = p_team_request_id
  ),
  candidates as (
    select distinct on (friend_profile.id)
      friend_profile.id,
      friend_profile.full_name,
      friend_profile.university,
      friend_profile.school,
      friend_profile.major,
      pending_invite.status as pending_status,
      member_row.profile_id as active_member_id
    from public.connections c
    join public.profiles friend_profile on friend_profile.id = case
      when c.sender_profile_id = p_owner_profile_id then c.receiver_profile_id
      else c.sender_profile_id end
    join public.class_members friend_class_member
      on friend_class_member.class_id = p_class_id
     and friend_class_member.profile_id = friend_profile.id
    left join public.class_team_memberships member_row
      on member_row.team_request_id = p_team_request_id
     and member_row.profile_id = friend_profile.id
    left join lateral (
      select i.status
      from public.class_team_invites i
      where i.team_request_id = p_team_request_id
        and i.invitee_profile_id = friend_profile.id
        and i.status = 'pending'
      order by i.created_at desc
      limit 1
    ) pending_invite on true
    where c.status = 'accepted'
      and c.sender_profile_id <> c.receiver_profile_id
      and p_owner_profile_id in (c.sender_profile_id, c.receiver_profile_id)
      -- An accepted connection is enough to invite a class teammate. The
      -- connection's origin/type must not exclude a friend who previously
      -- connected through another project context.
      and friend_profile.id <> p_owner_profile_id
    order by friend_profile.id, c.updated_at desc nulls last
  )
  select
    candidates.id,
    candidates.full_name,
    candidates.university,
    candidates.school,
    candidates.major,
    candidates.pending_status,
    case when candidates.active_member_id is null then null else 'active' end,
    (candidates.pending_status is null
      and candidates.active_member_id is null
      and request_row.status = 'looking'
      and team_size.current_size < request_row.total_team_size)
  from candidates
  cross join request_row
  cross join team_size
  order by lower(coalesce(candidates.full_name, '')), candidates.id;
end;
$$;

create or replace function public.invite_class_team_member(
  p_class_id uuid,
  p_team_request_id uuid,
  p_owner_profile_id uuid,
  p_invitee_profile_id uuid
)
returns table(id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  request_size integer;
  total_size integer;
  invite_id uuid;
  invite_status text;
begin
  if not public.owns_profile(p_owner_profile_id) then
    raise exception 'Profile ownership required.';
  end if;

  if exists (select 1 from public.profiles p where p.id = p_owner_profile_id and p.role = 'participant') then
    raise exception 'Participants cannot manage class teams.';
  end if;

  select greatest(coalesce(tr.total_team_size, tr.members_needed + 1), 1)
    into total_size
  from public.team_requests tr
  where tr.id = p_team_request_id
    and tr.class_id = p_class_id
    and tr.profile_id = p_owner_profile_id
    and tr.status = 'looking';

  if total_size is null then
    raise exception 'Only the active class-team owner can invite teammates.';
  end if;

  if not exists (
    select 1 from public.class_members cm
    where cm.class_id = p_class_id and cm.profile_id = p_invitee_profile_id
  ) then
    raise exception 'Invitee must be enrolled in this class.';
  end if;

  if not exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and p_owner_profile_id in (c.sender_profile_id, c.receiver_profile_id)
      and p_invitee_profile_id in (c.sender_profile_id, c.receiver_profile_id)
      -- Keep friendship separate from class-team membership. Any accepted
      -- connection between eligible class members may be invited.
  ) then
    raise exception 'Invitee must be a connected friend.';
  end if;

  if exists (select 1 from public.class_team_memberships ctm where ctm.team_request_id = p_team_request_id and ctm.profile_id = p_invitee_profile_id) then
    raise exception 'Profile is already in this team.';
  end if;

  if exists (select 1 from public.class_team_invites i where i.team_request_id = p_team_request_id and i.invitee_profile_id = p_invitee_profile_id and i.status = 'pending') then
    raise exception 'Invitation is already pending.';
  end if;

  select count(*)::integer + 1 into request_size
  from public.class_team_memberships ctm
  where ctm.team_request_id = p_team_request_id;

  if request_size >= total_size then
    raise exception 'Team is full.';
  end if;

  insert into public.class_team_invites (class_id, team_request_id, inviter_profile_id, invitee_profile_id)
  values (p_class_id, p_team_request_id, p_owner_profile_id, p_invitee_profile_id)
  returning id, status into invite_id, invite_status;

  return query select invite_id, invite_status;
end;
$$;

create or replace function public.list_class_team_invites(
  p_class_id uuid,
  p_profile_id uuid
)
returns table(
  id uuid,
  class_id uuid,
  team_request_id uuid,
  owner_name text,
  team_request_title text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.owns_profile(p_profile_id) then
    raise exception 'Profile ownership required.';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_profile_id and p.role = 'participant') then
    raise exception 'Participants cannot access class-team invites.';
  end if;

  return query
  select i.id, i.class_id, i.team_request_id,
    owner_profile.full_name,
    coalesce(tr.course_name, tr.course, 'Class team request'),
    i.status
  from public.class_team_invites i
  join public.profiles owner_profile on owner_profile.id = i.inviter_profile_id
  join public.team_requests tr on tr.id = i.team_request_id
  join public.class_members cm on cm.class_id = i.class_id and cm.profile_id = p_profile_id
  where i.class_id = p_class_id
    and i.invitee_profile_id = p_profile_id
    and i.status = 'pending'
  order by i.created_at desc;
end;
$$;

create or replace function public.list_class_team_requests_for_class(
  p_class_id uuid,
  p_profile_id uuid
)
returns setof public.team_requests
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.owns_profile(p_profile_id) then
    raise exception 'Profile ownership required.';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_profile_id and p.role = 'participant') then
    raise exception 'Participants cannot access class requests.';
  end if;

  return query
  select tr.*
  from public.team_requests tr
  join public.class_members cm on cm.class_id = tr.class_id and cm.profile_id = p_profile_id
  where tr.class_id = p_class_id
    and (
      tr.profile_id = p_profile_id
      or exists (
        select 1 from public.class_team_memberships ctm
        where ctm.team_request_id = tr.id and ctm.profile_id = p_profile_id
      )
    )
  order by tr.created_at desc;
end;
$$;

create or replace function public.respond_class_team_invite(
  p_invite_id uuid,
  p_profile_id uuid,
  p_response text
)
returns table(id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.class_team_invites;
  total_size integer;
  current_size integer;
begin
  if not public.owns_profile(p_profile_id) then
    raise exception 'Profile ownership required.';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_profile_id and p.role = 'participant') then
    raise exception 'Participants cannot respond to class-team invites.';
  end if;
  if p_response not in ('accepted', 'declined') then
    raise exception 'Invalid invitation response.';
  end if;

  select i.* into invite_row
  from public.class_team_invites i
  where i.id = p_invite_id
    and i.invitee_profile_id = p_profile_id
    and i.status = 'pending'
  for update;

  if invite_row.id is null then
    raise exception 'Invitation is no longer available.';
  end if;

  if p_response = 'accepted' then
    select greatest(coalesce(tr.total_team_size, tr.members_needed + 1), 1)
      into total_size
    from public.team_requests tr
    where tr.id = invite_row.team_request_id and tr.status = 'looking';

    select count(*)::integer + 1 into current_size
    from public.class_team_memberships ctm
    where ctm.team_request_id = invite_row.team_request_id;

    if total_size is null or current_size > total_size then
      raise exception 'Team is full or no longer open.';
    end if;

    if not exists (select 1 from public.class_members cm where cm.class_id = invite_row.class_id and cm.profile_id = p_profile_id) then
      raise exception 'You must be enrolled in this class.';
    end if;

    insert into public.class_team_memberships (class_id, team_request_id, profile_id)
    values (invite_row.class_id, invite_row.team_request_id, p_profile_id)
    on conflict (team_request_id, profile_id) do update set updated_at = now();
  end if;

  update public.class_team_invites
  set status = p_response, responded_at = now()
  where id = invite_row.id;

  return query select invite_row.id, p_response;
end;
$$;

create or replace function public.remove_class_team_member(
  p_class_id uuid,
  p_team_request_id uuid,
  p_owner_profile_id uuid,
  p_member_profile_id uuid
)
returns table(removed_profile_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.owns_profile(p_owner_profile_id) then
    raise exception 'Profile ownership required.';
  end if;
  if p_owner_profile_id = p_member_profile_id then
    raise exception 'The team owner cannot remove themselves.';
  end if;
  if not exists (
    select 1 from public.team_requests tr
    where tr.id = p_team_request_id and tr.class_id = p_class_id and tr.profile_id = p_owner_profile_id
  ) then
    raise exception 'Only the team owner can remove members.';
  end if;

  delete from public.class_team_memberships
  where class_id = p_class_id
    and team_request_id = p_team_request_id
    and profile_id = p_member_profile_id;

  update public.class_team_invites
  set status = 'cancelled', responded_at = now()
  where class_id = p_class_id
    and team_request_id = p_team_request_id
    and invitee_profile_id = p_member_profile_id
    and status = 'pending';

  return query select p_member_profile_id;
end;
$$;

create or replace function public.leave_class_team(
  p_class_id uuid,
  p_team_request_id uuid,
  p_profile_id uuid
)
returns table(left_profile_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  request_owner uuid;
begin
  if not public.owns_profile(p_profile_id) then
    raise exception 'Profile ownership required.';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_profile_id and p.role = 'participant') then
    raise exception 'Participants cannot leave class teams.';
  end if;

  select tr.profile_id into request_owner
  from public.team_requests tr
  where tr.id = p_team_request_id and tr.class_id = p_class_id;

  if request_owner = p_profile_id then
    raise exception 'The team owner must cancel the request before leaving.';
  end if;
  if not exists (
    select 1 from public.class_team_memberships ctm
    where ctm.class_id = p_class_id and ctm.team_request_id = p_team_request_id and ctm.profile_id = p_profile_id
  ) then
    raise exception 'Active class-team membership required.';
  end if;

  delete from public.class_team_memberships
  where class_id = p_class_id and team_request_id = p_team_request_id and profile_id = p_profile_id;

  return query select p_profile_id;
end;
$$;

create or replace function public.leave_class(
  p_class_id uuid,
  p_profile_id uuid
)
returns table(left_class_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.owns_profile(p_profile_id) then
    raise exception 'Profile ownership required.';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_profile_id and p.role = 'participant') then
    raise exception 'Participants cannot leave classes.';
  end if;
  if exists (
    select 1 from public.team_requests tr
    where tr.class_id = p_class_id and tr.profile_id = p_profile_id and tr.status = 'looking'
  ) then
    raise exception 'Cancel the active team request before leaving this class.';
  end if;

  delete from public.class_team_memberships
  where class_id = p_class_id and profile_id = p_profile_id;

  delete from public.class_members
  where class_id = p_class_id and profile_id = p_profile_id;

  return query select p_class_id;
end;
$$;

create or replace function public.get_team_request_progress(
  request_id uuid,
  current_profile uuid
)
returns table(found_count integer, teammates jsonb)
language sql
security definer
set search_path = public
as $$
with allowed_request as (
  select tr.*
  from public.team_requests tr
  where tr.id = request_id
    and public.owns_profile(current_profile)
    and (
      tr.profile_id = current_profile
      or (
        tr.class_id is not null
        and exists (
          select 1
          from public.class_team_memberships ctm
          where ctm.team_request_id = tr.id
            and ctm.profile_id = current_profile
        )
      )
    )
),
class_members as (
  select
    ctm.profile_id as teammate_profile_id,
    null::uuid as connection_id,
    ctm.updated_at
  from public.class_team_memberships ctm
  join allowed_request ar on ar.id = ctm.team_request_id and ar.class_id is not null
  where ctm.profile_id <> ar.profile_id
),
legacy_members as (
  select distinct on (
    case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end
  )
    case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end as teammate_profile_id,
    c.id as connection_id,
    c.updated_at
  from public.connections c
  join allowed_request ar on ar.id = c.sender_team_request_id
  where c.status = 'accepted'
    and current_profile in (c.sender_profile_id, c.receiver_profile_id)
    and (ar.class_id is null)
  order by
    case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end,
    c.updated_at desc
),
members as (
  select * from class_members
  union all
  select * from legacy_members
)
select
  count(m.teammate_profile_id)::integer,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'profile_id', p.id,
        'full_name', p.full_name,
        'major', p.major,
        'is_demo', p.is_demo,
        'connection_id', m.connection_id
      ) order by m.updated_at desc
    ) filter (where p.id is not null),
    '[]'::jsonb
  )
from members m
join public.profiles p on p.id = m.teammate_profile_id;
$$;

revoke all on function public.get_class_team_members(uuid, uuid, uuid) from public, anon;
revoke all on function public.prevent_participant_class_mutation() from public, anon, authenticated;
revoke all on function public.list_class_team_invite_candidates(uuid, uuid, uuid) from public, anon;
revoke all on function public.list_class_team_invites(uuid, uuid) from public, anon;
revoke all on function public.list_class_team_requests_for_class(uuid, uuid) from public, anon;
revoke all on function public.invite_class_team_member(uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.respond_class_team_invite(uuid, uuid, text) from public, anon;
revoke all on function public.remove_class_team_member(uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.leave_class_team(uuid, uuid, uuid) from public, anon;
revoke all on function public.leave_class(uuid, uuid) from public, anon;
revoke all on function public.get_team_request_progress(uuid, uuid) from public, anon;

grant execute on function public.get_class_team_members(uuid, uuid, uuid) to authenticated;
grant execute on function public.list_class_team_invite_candidates(uuid, uuid, uuid) to authenticated;
grant execute on function public.list_class_team_invites(uuid, uuid) to authenticated;
grant execute on function public.list_class_team_requests_for_class(uuid, uuid) to authenticated;
grant execute on function public.invite_class_team_member(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.respond_class_team_invite(uuid, uuid, text) to authenticated;
grant execute on function public.remove_class_team_member(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.leave_class_team(uuid, uuid, uuid) to authenticated;
grant execute on function public.leave_class(uuid, uuid) to authenticated;
grant execute on function public.get_team_request_progress(uuid, uuid) to authenticated;
