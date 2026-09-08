-- Teamergency: persist DEMO matches as request teammates.
--
-- Run manually in Supabase SQL Editor.
-- This does not change B1 progress functions, matching, capacity, or UI.
-- Generic/discover DEMO connections remain friends. Only a connection that
-- carries a sender_team_request_id is promoted to a request teammate.

create or replace function public.simulate_demo_acceptance(
  connection_request uuid,
  current_profile uuid
)
returns table(id uuid, status text, relationship_type text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  updated_connection public.connections;
  receiver_request uuid;
begin
  if not public.owns_profile(current_profile) then
    raise exception 'Current profile ownership required.';
  end if;

  select c.* into updated_connection
  from public.connections c
  join public.profiles receiver on receiver.id = c.receiver_profile_id
  where c.id = connection_request
    and c.sender_profile_id = current_profile
    and receiver.is_demo = true
    and c.status = 'pending';

  if updated_connection.id is null then
    return;
  end if;

  if updated_connection.sender_team_request_id is not null then
    select receiver_row.id into receiver_request
    from public.team_requests sender_row
    join public.team_requests receiver_row
      on receiver_row.profile_id = updated_connection.receiver_profile_id
    where sender_row.id = updated_connection.sender_team_request_id
      and receiver_row.status = 'looking'
      and (
        (
          sender_row.class_id is not null
          and receiver_row.class_id = sender_row.class_id
          and lower(coalesce(receiver_row.class_session, '')) = lower(coalesce(sender_row.class_session, ''))
        )
        or (
          sender_row.class_id is null
          and receiver_row.class_id is null
          and lower(coalesce(receiver_row.major, '')) = lower(coalesce(sender_row.major, ''))
          and (
            lower(coalesce(receiver_row.course_code, '')) = lower(coalesce(sender_row.course_code, ''))
            or lower(coalesce(receiver_row.course_name, receiver_row.course, '')) = lower(coalesce(sender_row.course_name, sender_row.course, ''))
          )
          and lower(coalesce(receiver_row.class_session, '')) = lower(coalesce(sender_row.class_session, ''))
        )
      )
    order by receiver_row.created_at desc
    limit 1;
  end if;

  update public.connections c
  set
    status = 'accepted',
    accepted_at = coalesce(c.accepted_at, now()),
    receiver_team_request_id = case
      when c.sender_team_request_id is not null then receiver_request
      else c.receiver_team_request_id
    end,
    relationship_type = case
      when c.sender_team_request_id is not null then 'teammate'
      else c.relationship_type
    end,
    connection_context = case
      when c.sender_team_request_id is not null then 'team_request'
      else c.connection_context
    end,
    updated_at = now()
  where c.id = updated_connection.id
  returning * into updated_connection;

  -- A DEMO has no account-side Accept action, so persist the same active
  -- request-linked relationship that a real accepted teammate requires.
  if updated_connection.sender_team_request_id is not null
     and updated_connection.relationship_type = 'teammate' then
    insert into public.teammate_relationships (
      connection_id,
      profile_a_id,
      profile_b_id,
      request_a_id,
      request_b_id,
      status,
      created_at
    )
    select
      updated_connection.id,
      updated_connection.sender_profile_id,
      updated_connection.receiver_profile_id,
      updated_connection.sender_team_request_id,
      updated_connection.receiver_team_request_id,
      'active',
      coalesce(updated_connection.accepted_at, updated_connection.updated_at, updated_connection.created_at)
    where not exists (
      select 1
      from public.teammate_relationships rel
      where rel.status = 'active'
        and (
          rel.connection_id = updated_connection.id
          or (
            rel.request_a_id = updated_connection.sender_team_request_id
            and rel.profile_a_id = updated_connection.sender_profile_id
            and rel.profile_b_id = updated_connection.receiver_profile_id
          )
        )
    )
    on conflict do nothing;
  end if;

  return query select
    updated_connection.id,
    updated_connection.status,
    updated_connection.relationship_type;
end;
$function$;

grant execute on function public.simulate_demo_acceptance(uuid, uuid) to authenticated;
