alter table public.connections
alter column sender_team_request_id drop not null;

alter table public.connections
add column if not exists intro_message text;

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
  select true into receiver_exists
  from public.profiles
  where profiles.id = receiver_profile;

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

  return query select created_connection.id, created_connection.status;
end;
$$;

create or replace function public.simulate_demo_acceptance(
  connection_request uuid,
  current_profile uuid
)
returns table(id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.connections c
  set status = 'accepted'
  from public.profiles receiver
  where c.id = connection_request
    and c.sender_profile_id = current_profile
    and c.receiver_profile_id = receiver.id
    and receiver.is_demo = true
    and c.status = 'pending'
  returning c.id, c.status;
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
begin
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

  return query
  insert into public.messages (connection_id, sender_profile_id, message_text)
  values (connection_request, demo_profile, trim(reply_text))
  returning messages.id, messages.connection_id, messages.sender_profile_id, messages.message_text, messages.created_at;
end;
$$;

create or replace function public.reset_demo_connection(
  connection_request uuid,
  current_profile uuid
)
returns table(id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_id uuid;
begin
  delete from public.messages m
  using public.connections c, public.profiles p
  where m.connection_id = c.id
    and c.id = connection_request
    and c.sender_profile_id = current_profile
    and c.receiver_profile_id = p.id
    and p.is_demo = true;

  delete from public.connections c
  using public.profiles p
  where c.id = connection_request
    and c.sender_profile_id = current_profile
    and c.receiver_profile_id = p.id
    and p.is_demo = true
  returning c.id into deleted_id;

  return query select deleted_id;
end;
$$;

grant execute on function public.send_connection_request(uuid, uuid, uuid, text) to anon;
grant execute on function public.simulate_demo_acceptance(uuid, uuid) to anon;
grant execute on function public.send_demo_reply(uuid, uuid, text) to anon;
grant execute on function public.reset_demo_connection(uuid, uuid) to anon;
