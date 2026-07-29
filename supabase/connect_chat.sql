create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  receiver_profile_id uuid not null references public.profiles(id) on delete cascade,
  sender_team_request_id uuid not null references public.team_requests(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connections_not_self check (sender_profile_id <> receiver_profile_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  message_text text not null check (length(trim(message_text)) > 0),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_request_id uuid not null references public.team_requests(id) on delete cascade,
  teammate_profile_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  added_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (team_request_id, teammate_profile_id)
);

create unique index if not exists connections_active_pair_unique_idx
on public.connections (
  least(sender_profile_id, receiver_profile_id),
  greatest(sender_profile_id, receiver_profile_id)
)
where status in ('pending', 'accepted');

create index if not exists connections_sender_idx on public.connections(sender_profile_id);
create index if not exists connections_receiver_idx on public.connections(receiver_profile_id);
create index if not exists connections_status_idx on public.connections(status);
create index if not exists messages_connection_created_idx on public.messages(connection_id, created_at);
create index if not exists messages_sender_idx on public.messages(sender_profile_id);
create index if not exists team_members_request_idx on public.team_members(team_request_id);
create index if not exists team_members_connection_idx on public.team_members(connection_id);

alter table public.connections enable row level security;
alter table public.messages enable row level security;
alter table public.team_members enable row level security;

revoke all on public.connections from anon;
revoke all on public.messages from anon;
revoke all on public.team_members from anon;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists connections_touch_updated_at on public.connections;
create trigger connections_touch_updated_at
before update on public.connections
for each row
execute function public.touch_updated_at();

create or replace function public.send_connection_request(
  sender_profile uuid,
  receiver_profile uuid,
  sender_request uuid
)
returns table(id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  receiver_is_demo boolean;
  created_connection public.connections;
begin
  select is_demo into receiver_is_demo
  from public.profiles
  where profiles.id = receiver_profile;

  if receiver_is_demo is null then
    raise exception 'Receiver profile does not exist.';
  end if;

  if receiver_is_demo then
    raise exception 'Demo profile connection unavailable.';
  end if;

  if not exists (
    select 1
    from public.team_requests tr
    where tr.id = sender_request
      and tr.profile_id = sender_profile
      and tr.status = 'looking'
  ) then
    raise exception 'Sender request is not active.';
  end if;

  select c.* into created_connection
  from public.connections c
  where least(c.sender_profile_id, c.receiver_profile_id) = least(sender_profile, receiver_profile)
    and greatest(c.sender_profile_id, c.receiver_profile_id) = greatest(sender_profile, receiver_profile)
    and c.status in ('pending', 'accepted')
  limit 1;

  if created_connection.id is not null then
    return query select created_connection.id, created_connection.status;
    return;
  end if;

  insert into public.connections (
    sender_profile_id,
    receiver_profile_id,
    sender_team_request_id,
    status
  )
  values (
    sender_profile,
    receiver_profile,
    sender_request,
    'pending'
  )
  returning * into created_connection;

  return query select created_connection.id, created_connection.status;
end;
$$;

create or replace function public.respond_connection_request(
  connection_request uuid,
  receiver_profile uuid,
  response_status text
)
returns table(id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if response_status not in ('accepted', 'declined') then
    raise exception 'Invalid connection response.';
  end if;

  return query
  update public.connections c
  set status = response_status
  where c.id = connection_request
    and c.receiver_profile_id = receiver_profile
    and c.status = 'pending'
  returning c.id, c.status;
end;
$$;

create or replace function public.cancel_connection_request(
  connection_request uuid,
  sender_profile uuid
)
returns table(id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.connections c
  set status = 'cancelled'
  where c.id = connection_request
    and c.sender_profile_id = sender_profile
    and c.status = 'pending'
  returning c.id, c.status;
end;
$$;

create or replace function public.get_connection_between(
  current_profile uuid,
  teammate_profile uuid
)
returns table(
  id uuid,
  sender_profile_id uuid,
  receiver_profile_id uuid,
  sender_team_request_id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz
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
    c.status,
    c.created_at,
    c.updated_at
  from public.connections c
  where least(c.sender_profile_id, c.receiver_profile_id) = least(current_profile, teammate_profile)
    and greatest(c.sender_profile_id, c.receiver_profile_id) = greatest(current_profile, teammate_profile)
  order by c.created_at desc
  limit 1;
$$;

create or replace function public.list_connection_requests(
  current_profile uuid,
  direction text
)
returns table(
  id uuid,
  sender_profile_id uuid,
  receiver_profile_id uuid,
  sender_team_request_id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  teammate_profile_id uuid,
  teammate_full_name text,
  teammate_major text,
  teammate_skills text[],
  course text,
  skills_needed text[],
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
    c.status,
    c.created_at,
    c.updated_at,
    case when direction = 'incoming' then c.sender_profile_id else c.receiver_profile_id end as teammate_profile_id,
    p.full_name as teammate_full_name,
    p.major as teammate_major,
    p.skills as teammate_skills,
    tr.course,
    tr.skills_needed,
    tr.members_needed
  from public.connections c
  join public.profiles p
    on p.id = case when direction = 'incoming' then c.sender_profile_id else c.receiver_profile_id end
  join public.team_requests tr on tr.id = c.sender_team_request_id
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

create or replace function public.send_message(
  connection_request uuid,
  sender_profile uuid,
  body text
)
returns table(id uuid, connection_id uuid, sender_profile_id uuid, message_text text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(trim(body)) = 0 then
    raise exception 'Message text is required.';
  end if;

  if not exists (
    select 1
    from public.connections c
    where c.id = connection_request
      and c.status = 'accepted'
      and sender_profile in (c.sender_profile_id, c.receiver_profile_id)
  ) then
    raise exception 'Accepted connection required.';
  end if;

  return query
  insert into public.messages (connection_id, sender_profile_id, message_text)
  values (connection_request, sender_profile, trim(body))
  returning messages.id, messages.connection_id, messages.sender_profile_id, messages.message_text, messages.created_at;
end;
$$;

create or replace function public.list_messages(
  connection_request uuid,
  current_profile uuid
)
returns table(id uuid, connection_id uuid, sender_profile_id uuid, message_text text, created_at timestamptz, read_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select m.id, m.connection_id, m.sender_profile_id, m.message_text, m.created_at, m.read_at
  from public.messages m
  join public.connections c on c.id = m.connection_id
  where m.connection_id = connection_request
    and c.status = 'accepted'
    and current_profile in (c.sender_profile_id, c.receiver_profile_id)
  order by m.created_at asc;
$$;

create or replace function public.list_message_threads(
  current_profile uuid
)
returns table(
  connection_id uuid,
  teammate_profile_id uuid,
  teammate_full_name text,
  teammate_major text,
  last_message text,
  last_message_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    c.id as connection_id,
    case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end as teammate_profile_id,
    p.full_name as teammate_full_name,
    p.major as teammate_major,
    lm.message_text as last_message,
    lm.created_at as last_message_at,
    c.updated_at
  from public.connections c
  join public.profiles p
    on p.id = case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end
  left join lateral (
    select message_text, created_at
    from public.messages m
    where m.connection_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  where c.status = 'accepted'
    and current_profile in (c.sender_profile_id, c.receiver_profile_id)
  order by coalesce(lm.created_at, c.updated_at) desc;
$$;

create or replace function public.get_connection_detail(
  connection_request uuid,
  current_profile uuid
)
returns table(
  id uuid,
  sender_profile_id uuid,
  receiver_profile_id uuid,
  status text,
  teammate_profile_id uuid,
  teammate_full_name text,
  teammate_major text
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.sender_profile_id,
    c.receiver_profile_id,
    c.status,
    case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end as teammate_profile_id,
    p.full_name as teammate_full_name,
    p.major as teammate_major
  from public.connections c
  join public.profiles p
    on p.id = case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end
  where c.id = connection_request
    and current_profile in (c.sender_profile_id, c.receiver_profile_id)
  limit 1;
$$;

create or replace function public.add_team_member(
  current_profile uuid,
  current_request uuid,
  connection_request uuid
)
returns table(id uuid, team_request_id uuid, teammate_profile_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  teammate uuid;
  member_row public.team_members;
begin
  select
    case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end
  into teammate
  from public.connections c
  where c.id = connection_request
    and c.status = 'accepted'
    and current_profile in (c.sender_profile_id, c.receiver_profile_id);

  if teammate is null then
    raise exception 'Accepted connection required.';
  end if;

  if not exists (
    select 1
    from public.team_requests tr
    where tr.id = current_request
      and tr.profile_id = current_profile
  ) then
    raise exception 'Current request does not belong to profile.';
  end if;

  insert into public.team_members (
    team_request_id,
    teammate_profile_id,
    connection_id,
    added_by_profile_id
  )
  values (
    current_request,
    teammate,
    connection_request,
    current_profile
  )
  on conflict (team_request_id, teammate_profile_id)
  do update set connection_id = excluded.connection_id
  returning * into member_row;

  return query select member_row.id, member_row.team_request_id, member_row.teammate_profile_id;
end;
$$;

grant execute on function public.send_connection_request(uuid, uuid, uuid) to anon;
grant execute on function public.respond_connection_request(uuid, uuid, text) to anon;
grant execute on function public.cancel_connection_request(uuid, uuid) to anon;
grant execute on function public.get_connection_between(uuid, uuid) to anon;
grant execute on function public.list_connection_requests(uuid, text) to anon;
grant execute on function public.send_message(uuid, uuid, text) to anon;
grant execute on function public.list_messages(uuid, uuid) to anon;
grant execute on function public.list_message_threads(uuid) to anon;
grant execute on function public.get_connection_detail(uuid, uuid) to anon;
grant execute on function public.add_team_member(uuid, uuid, uuid) to anon;
