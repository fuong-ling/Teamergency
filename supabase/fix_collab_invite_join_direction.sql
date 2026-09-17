-- Teamergency: keep Collab invite/join acceptance bound to one explicit
-- target team request.
--
-- Run manually in Supabase SQL Editor after review. Do not execute from the
-- application. This repair assumes public.team_request_memberships has been
-- created by the Collab membership migration.
--
-- The existing RPC contract is preserved:
--   respond_connection_request(uuid, uuid, text)
--   returns TABLE(id uuid, status text)

-- Mark newly created Collab invitations as teammate requests and keep the
-- sender's request as the only target. Class matching retains the historical
-- path because this repair is scoped to open Collab requests.
drop function if exists public.send_connection_request(uuid, uuid, uuid, text);

create function public.send_connection_request(
  sender_profile uuid,
  receiver_profile uuid,
  sender_request uuid,
  intro_message text
)
returns table(id uuid, status text, connection_context text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  receiver_exists boolean;
  receiver_request uuid;
  sender_is_collab boolean := false;
  created_connection public.connections;
begin
  if not public.owns_profile(sender_profile) then
    raise exception 'Sender profile ownership required.';
  end if;

  select true
  into receiver_exists
  from public.profiles p
  where p.id = receiver_profile
    and (p.is_demo = true or (p.consent_public_visibility = true and p.is_available = true));

  if receiver_exists is null then
    raise exception 'Receiver profile does not exist.';
  end if;

  if sender_request is not null then
    select tr.class_id is null
    into sender_is_collab
    from public.team_requests tr
    where tr.id = sender_request
      and tr.profile_id = sender_profile
      and tr.status = 'looking';

    if not found then
      raise exception 'Sender request is not active.';
    end if;

    if not sender_is_collab then
      receiver_request := public.find_receiver_team_request(sender_request, receiver_profile);
    end if;
  end if;

  select c.*
  into created_connection
  from public.connections c
  where least(c.sender_profile_id, c.receiver_profile_id) = least(sender_profile, receiver_profile)
    and greatest(c.sender_profile_id, c.receiver_profile_id) = greatest(sender_profile, receiver_profile)
    and c.status in ('pending', 'accepted')
    and c.connection_context = case when sender_request is null then 'discover' else 'team_request' end
  limit 1;

  if created_connection.id is not null then
    if sender_is_collab
      and created_connection.sender_team_request_id = sender_request then
      if created_connection.status = 'accepted'
        and not exists (
          select 1
          from public.team_request_memberships tm
          where tm.team_request_id = sender_request
            and tm.member_profile_id = receiver_profile
        ) then
        update public.connections c
        set status = 'pending',
            accepted_at = null,
            relationship_type = 'teammate',
            connection_context = 'team_request',
            receiver_team_request_id = null,
            updated_at = now()
        where c.id = created_connection.id
        returning c.* into created_connection;

        perform public.create_notification(
          receiver_profile,
          sender_profile,
          'connection_request',
          created_connection.id,
          null
        );
      elsif created_connection.status = 'pending' then
        update public.connections c
        set relationship_type = 'teammate',
            connection_context = 'team_request',
            receiver_team_request_id = null,
            updated_at = now()
        where c.id = created_connection.id
        returning c.* into created_connection;
      end if;
    end if;

    return query select created_connection.id, created_connection.status, created_connection.connection_context;
    return;
  end if;

  insert into public.connections (
    sender_profile_id,
    receiver_profile_id,
    sender_team_request_id,
    receiver_team_request_id,
    connection_context,
    relationship_type,
    intro_message,
    status
  )
  values (
    sender_profile,
    receiver_profile,
    sender_request,
    receiver_request,
    case when sender_request is null then 'discover' else 'team_request' end,
    case when sender_is_collab then 'teammate' else 'friend' end,
    nullif(trim(coalesce(intro_message, '')), ''),
    'pending'
  )
  returning * into created_connection;

  perform public.create_notification(
    receiver_profile,
    sender_profile,
    'connection_request',
    created_connection.id,
    null
  );

  return query select created_connection.id, created_connection.status, created_connection.connection_context;
end;
$function$;

revoke all on function public.send_connection_request(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.send_connection_request(uuid, uuid, uuid, text) to authenticated;

create or replace function public.respond_connection_request(
  connection_request uuid,
  receiver_profile uuid,
  response_status text
)
returns table(id uuid, status text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  updated_connection public.connections;
  target_request_row public.team_requests;
  target_request_id uuid;
  target_member_id uuid;
  current_members integer;
  total_members integer;
  already_member boolean;
begin
  if response_status not in ('accepted', 'declined') then
    raise exception 'Invalid connection response.';
  end if;

  if not public.owns_profile(receiver_profile) then
    raise exception 'Receiver profile ownership required.';
  end if;

  select c.*
  into updated_connection
  from public.connections c
  where c.id = connection_request
    and c.receiver_profile_id = receiver_profile
    and c.status = 'pending';

  if updated_connection.id is null then
    return;
  end if;

  if response_status = 'declined' then
    update public.connections c
    set status = response_status,
        updated_at = now()
    where c.id = updated_connection.id
    returning c.* into updated_connection;

    perform public.create_notification(
      updated_connection.sender_profile_id,
      receiver_profile,
      'connection_declined',
      updated_connection.id,
      null
    );

    return query select updated_connection.id, updated_connection.status;
    return;
  end if;

  -- A normal Friend request remains a Friend request even when it was
  -- initiated from a team-request context. Request IDs are not enough to
  -- infer Collab membership; the relationship must explicitly be teammate.
  if coalesce(updated_connection.relationship_type, 'friend') = 'teammate'
    and updated_connection.connection_context = 'team_request'
    and (
      updated_connection.sender_team_request_id is not null
      or updated_connection.receiver_team_request_id is not null
    ) then
    -- Owner invite: the sender's request is the explicit target project and
    -- the receiver is the candidate being invited. Never switch to a request
    -- owned by the receiver.
    if updated_connection.sender_team_request_id is not null then
      target_request_id := updated_connection.sender_team_request_id;
      target_member_id := updated_connection.receiver_profile_id;

      select tr.*
      into target_request_row
      from public.team_requests tr
      where tr.id = target_request_id
        and tr.profile_id = updated_connection.sender_profile_id
        and tr.status = 'looking'
        and tr.class_id is null
        and (tr.request_scope = 'open_opportunity' or tr.opportunity_name is not null)
      for update;
    else
      -- Request-to-Join: the receiver's request is the explicit target
      -- project and the sender is the candidate being accepted.
      target_request_id := updated_connection.receiver_team_request_id;
      target_member_id := updated_connection.sender_profile_id;

      select tr.*
      into target_request_row
      from public.team_requests tr
      where tr.id = target_request_id
        and tr.profile_id = updated_connection.receiver_profile_id
        and tr.status = 'looking'
        and tr.class_id is null
        and (tr.request_scope = 'open_opportunity' or tr.opportunity_name is not null)
      for update;
    end if;

    if target_request_row.id is null then
      raise exception 'Target Collab request is no longer active.';
    end if;

    if target_member_id = target_request_row.profile_id then
      raise exception 'The project owner cannot be added as a member.';
    end if;

    select exists (
      select 1
      from public.team_request_memberships tm
      where tm.team_request_id = target_request_id
        and tm.member_profile_id = target_member_id
    )
    into already_member;

    total_members := coalesce(
      target_request_row.total_team_size,
      target_request_row.members_needed + 1,
      2
    );

    select greatest(
      1,
      coalesce(
        target_request_row.baseline_member_count,
        total_members - coalesce(
          target_request_row.teammates_needed_initial,
          target_request_row.members_needed,
          1
        ),
        1
      ) + count(tm.id)::integer
    )
    into current_members
    from public.team_request_memberships tm
    where tm.team_request_id = target_request_id;

    if not already_member and current_members >= total_members then
      raise exception 'Team is already full.';
    end if;

    update public.connections c
    set status = 'accepted',
        accepted_at = coalesce(c.accepted_at, now()),
        updated_at = now(),
        relationship_type = 'teammate',
        connection_context = 'team_request',
        -- An owner invite is fully represented by sender_team_request_id.
        -- Clear the candidate's unrelated request reference so later reads
        -- cannot mistake it for a second membership target.
        receiver_team_request_id = case
          when updated_connection.sender_team_request_id is not null then null
          else c.receiver_team_request_id
        end
    where c.id = updated_connection.id
    returning c.* into updated_connection;

    insert into public.team_request_memberships (
      team_request_id,
      member_profile_id,
      joined_via_connection_id
    )
    values (
      target_request_id,
      target_member_id,
      updated_connection.id
    )
    on conflict (team_request_id, member_profile_id) do nothing;

    -- Keep the legacy graph compatible without using it as the authoritative
    -- membership source. The target request is request_a; request_b is null
    -- so a candidate's unrelated project is never attached accidentally.
    insert into public.teammate_relationships (
      connection_id,
      profile_a_id,
      profile_b_id,
      request_a_id,
      request_b_id,
      status
    )
    values (
      updated_connection.id,
      least(target_request_row.profile_id, target_member_id),
      greatest(target_request_row.profile_id, target_member_id),
      target_request_id,
      null,
      'active'
    )
    on conflict do nothing;
  else
    -- Generic Friend acceptance is independent of project compatibility and
    -- does not create a project membership.
    update public.connections c
    set status = 'accepted',
        accepted_at = coalesce(c.accepted_at, now()),
        updated_at = now(),
        relationship_type = 'friend'
    where c.id = updated_connection.id
    returning c.* into updated_connection;
  end if;

  perform public.create_notification(
    updated_connection.sender_profile_id,
    receiver_profile,
    'connection_accepted',
    updated_connection.id,
    null
  );

  return query select updated_connection.id, updated_connection.status;
end;
$function$;

revoke all on function public.respond_connection_request(uuid, uuid, text) from public, anon;
grant execute on function public.respond_connection_request(uuid, uuid, text) to authenticated;
