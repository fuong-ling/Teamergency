alter table public.connections
add column if not exists team_decision text not null default 'undecided'
check (team_decision in ('undecided', 'accepted', 'unaccepted'));

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('connection_request', 'connection_accepted', 'new_message', 'teammate_accepted')),
  connection_id uuid references public.connections(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_unread_idx
on public.notifications(recipient_profile_id, is_read, created_at desc);

create index if not exists connections_team_decision_idx
on public.connections(team_decision);

alter table public.notifications enable row level security;

drop policy if exists "Authenticated can read own notifications" on public.notifications;
drop policy if exists "Authenticated can update own notifications" on public.notifications;

create policy "Authenticated can read own notifications"
on public.notifications
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = notifications.recipient_profile_id
      and p.owner_id = auth.uid()
  )
);

create policy "Authenticated can update own notifications"
on public.notifications
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = notifications.recipient_profile_id
      and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = notifications.recipient_profile_id
      and p.owner_id = auth.uid()
  )
);

revoke all on public.notifications from anon;
grant select, update on public.notifications to authenticated;

create or replace function public.create_notification(
  recipient_profile uuid,
  actor_profile uuid,
  notification_type text,
  related_connection uuid default null,
  related_message uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if recipient_profile is null or recipient_profile = actor_profile then
    return;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = recipient_profile
      and p.is_demo = false
  ) then
    return;
  end if;

  insert into public.notifications (
    recipient_profile_id,
    actor_profile_id,
    type,
    connection_id,
    message_id
  )
  values (
    recipient_profile,
    actor_profile,
    notification_type,
    related_connection,
    related_message
  );
end;
$$;

create or replace function public.send_connection_request(
  sender_profile uuid,
  receiver_profile uuid,
  sender_request uuid,
  intro_message text
)
returns table(id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  receiver_exists boolean;
  created_connection public.connections;
begin
  if not public.owns_profile(sender_profile) then
    raise exception 'Sender profile ownership required.';
  end if;

  select true into receiver_exists
  from public.profiles
  where profiles.id = receiver_profile
    and (profiles.is_demo = true or profiles.consent_public_visibility = true);

  if receiver_exists is null then
    raise exception 'Receiver profile does not exist.';
  end if;

  if sender_request is not null and not exists (
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
    intro_message,
    status
  )
  values (
    sender_profile,
    receiver_profile,
    sender_request,
    nullif(trim(intro_message), ''),
    'pending'
  )
  returning * into created_connection;

  perform public.create_notification(receiver_profile, sender_profile, 'connection_request', created_connection.id, null);

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
declare
  updated_connection public.connections;
begin
  if response_status not in ('accepted', 'declined') then
    raise exception 'Invalid connection response.';
  end if;

  if not public.owns_profile(receiver_profile) then
    raise exception 'Receiver profile ownership required.';
  end if;

  update public.connections c
  set status = response_status
  where c.id = connection_request
    and c.receiver_profile_id = receiver_profile
    and c.status = 'pending'
  returning * into updated_connection;

  if updated_connection.id is not null and response_status = 'accepted' then
    perform public.create_notification(updated_connection.sender_profile_id, receiver_profile, 'connection_accepted', updated_connection.id, null);
  end if;

  if updated_connection.id is null then
    return;
  end if;

  return query select updated_connection.id, updated_connection.status;
end;
$$;

drop function if exists public.get_connection_between(uuid, uuid);
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
  team_decision text,
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
    c.team_decision,
    c.created_at,
    c.updated_at
  from public.connections c
  where public.owns_profile(current_profile)
    and least(c.sender_profile_id, c.receiver_profile_id) = least(current_profile, teammate_profile)
    and greatest(c.sender_profile_id, c.receiver_profile_id) = greatest(current_profile, teammate_profile)
  order by c.created_at desc
  limit 1;
$$;

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
  team_decision text,
  created_at timestamptz,
  updated_at timestamptz,
  teammate_profile_id uuid,
  teammate_full_name text,
  teammate_school text,
  teammate_major text,
  teammate_skills text[],
  teammate_is_demo boolean,
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
    c.team_decision,
    c.created_at,
    c.updated_at,
    case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end as teammate_profile_id,
    p.full_name as teammate_full_name,
    p.school as teammate_school,
    p.major as teammate_major,
    p.skills as teammate_skills,
    p.is_demo as teammate_is_demo,
    tr.course,
    tr.course_name,
    tr.course_code,
    tr.class_session,
    tr.skills_needed,
    tr.work_styles,
    tr.members_needed
  from public.connections c
  join public.profiles p
    on p.id = case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end
  left join public.team_requests tr on tr.id = c.sender_team_request_id
  where public.owns_profile(current_profile)
    and (
      (direction in ('received', 'incoming') and c.receiver_profile_id = current_profile and c.status = 'pending')
      or (direction = 'sent' and c.sender_profile_id = current_profile and c.status = 'pending')
      or (direction = 'connected' and current_profile in (c.sender_profile_id, c.receiver_profile_id) and c.status = 'accepted')
      or (direction in ('declined', 'not_accepted') and current_profile in (c.sender_profile_id, c.receiver_profile_id) and c.status in ('declined', 'cancelled'))
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
declare
  inserted_message public.messages;
  recipient_profile uuid;
begin
  if length(trim(body)) = 0 then
    raise exception 'Message text is required.';
  end if;

  if not public.owns_profile(sender_profile) then
    raise exception 'Sender profile ownership required.';
  end if;

  select
    case when c.sender_profile_id = sender_profile then c.receiver_profile_id else c.sender_profile_id end
  into recipient_profile
  from public.connections c
  where c.id = connection_request
    and c.status = 'accepted'
    and sender_profile in (c.sender_profile_id, c.receiver_profile_id);

  if recipient_profile is null then
    raise exception 'Accepted connection required.';
  end if;

  insert into public.messages (connection_id, sender_profile_id, message_text)
  values (connection_request, sender_profile, trim(body))
  returning * into inserted_message;

  perform public.create_notification(recipient_profile, sender_profile, 'new_message', connection_request, inserted_message.id);

  return query
  select inserted_message.id, inserted_message.connection_id, inserted_message.sender_profile_id, inserted_message.message_text, inserted_message.created_at;
end;
$$;

drop function if exists public.get_connection_detail(uuid, uuid);
create or replace function public.get_connection_detail(
  connection_request uuid,
  current_profile uuid
)
returns table(
  id uuid,
  sender_profile_id uuid,
  receiver_profile_id uuid,
  status text,
  team_decision text,
  teammate_profile_id uuid,
  teammate_full_name text,
  teammate_major text,
  teammate_is_demo boolean
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
    c.team_decision,
    case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end as teammate_profile_id,
    p.full_name as teammate_full_name,
    p.major as teammate_major,
    p.is_demo as teammate_is_demo
  from public.connections c
  join public.profiles p
    on p.id = case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end
  where public.owns_profile(current_profile)
    and c.id = connection_request
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
  if not public.owns_profile(current_profile) then
    raise exception 'Current profile ownership required.';
  end if;

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

  update public.connections
  set team_decision = 'accepted'
  where connections.id = connection_request;

  perform public.create_notification(teammate, current_profile, 'teammate_accepted', connection_request, null);

  return query select member_row.id, member_row.team_request_id, member_row.teammate_profile_id;
end;
$$;

create or replace function public.set_connection_team_decision(
  connection_request uuid,
  current_profile uuid,
  decision text
)
returns table(id uuid, team_decision text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if decision not in ('undecided', 'accepted', 'unaccepted') then
    raise exception 'Invalid team decision.';
  end if;

  if not public.owns_profile(current_profile) then
    raise exception 'Current profile ownership required.';
  end if;

  return query
  update public.connections c
  set team_decision = decision
  where c.id = connection_request
    and c.status = 'accepted'
    and current_profile in (c.sender_profile_id, c.receiver_profile_id)
  returning c.id, c.team_decision;
end;
$$;

create or replace function public.send_demo_reply(
  connection_request uuid,
  current_profile uuid,
  reply_text text
)
returns table(id uuid, connection_id uuid, sender_profile_id uuid, message_text text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  demo_profile uuid;
  inserted_message public.messages;
begin
  if not public.owns_profile(current_profile) then
    raise exception 'Current profile ownership required.';
  end if;

  select c.receiver_profile_id into demo_profile
  from public.connections c
  join public.profiles p on p.id = c.receiver_profile_id
  where c.id = connection_request
    and c.sender_profile_id = current_profile
    and c.status = 'accepted'
    and p.is_demo = true;

  if demo_profile is null then
    raise exception 'Accepted demo connection required.';
  end if;

  insert into public.messages (connection_id, sender_profile_id, message_text)
  values (connection_request, demo_profile, trim(reply_text))
  returning * into inserted_message;

  perform public.create_notification(current_profile, demo_profile, 'new_message', connection_request, inserted_message.id);

  return query
  select inserted_message.id, inserted_message.connection_id, inserted_message.sender_profile_id, inserted_message.message_text, inserted_message.created_at;
end;
$$;

create or replace function public.get_notification_counts(
  current_profile uuid
)
returns table(connections_count integer, messages_count integer)
language sql
security definer
set search_path = public
as $$
  select
    count(*) filter (where n.type in ('connection_request', 'connection_accepted', 'teammate_accepted'))::integer as connections_count,
    count(*) filter (where n.type = 'new_message')::integer as messages_count
  from public.notifications n
  where public.owns_profile(current_profile)
    and n.recipient_profile_id = current_profile
    and n.is_read = false;
$$;

create or replace function public.mark_notifications_read(
  current_profile uuid,
  area text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.owns_profile(current_profile) then
    raise exception 'Current profile ownership required.';
  end if;

  update public.notifications n
  set is_read = true
  where n.recipient_profile_id = current_profile
    and n.is_read = false
    and (
      area = 'all'
      or (area = 'connections' and n.type in ('connection_request', 'connection_accepted', 'teammate_accepted'))
      or (area = 'messages' and n.type = 'new_message')
    );
end;
$$;

revoke all on function public.create_notification(uuid, uuid, text, uuid, uuid) from public;
revoke all on function public.get_connection_between(uuid, uuid) from public;
revoke all on function public.list_connection_requests(uuid, text) from public;
revoke all on function public.get_connection_detail(uuid, uuid) from public;
revoke all on function public.set_connection_team_decision(uuid, uuid, text) from public;
revoke all on function public.get_notification_counts(uuid) from public;
revoke all on function public.mark_notifications_read(uuid, text) from public;

grant execute on function public.get_connection_between(uuid, uuid) to authenticated;
grant execute on function public.list_connection_requests(uuid, text) to authenticated;
grant execute on function public.get_connection_detail(uuid, uuid) to authenticated;
grant execute on function public.set_connection_team_decision(uuid, uuid, text) to authenticated;
grant execute on function public.get_notification_counts(uuid) to authenticated;
grant execute on function public.mark_notifications_read(uuid, text) to authenticated;
