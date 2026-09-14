-- Collab C: direct Request to Join support.
--
-- Run manually in Supabase SQL Editor only after review.
-- This does not change B1 progress functions, demo acceptance, matching,
-- analytics, messaging, or existing request data.
--
-- A direct join has no sender-owned team request. The target Collab request
-- is therefore stored in connections.receiver_team_request_id. On acceptance
-- the existing acceptance RPC creates an active relationship with that target
-- request in request_a_id and a NULL request_b_id.

-- 1. Create a pending request against one specific open Collab request.
create or replace function public.request_to_join_team_request(
  target_request uuid,
  joining_profile uuid,
  intro_message text
)
returns table(id uuid, status text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_row public.team_requests;
  existing_connection public.connections;
  created_connection public.connections;
  current_members integer;
begin
  if not public.owns_profile(joining_profile) then
    raise exception 'Joining profile ownership required.';
  end if;

  select tr.* into target_row
  from public.team_requests tr
  where tr.id = target_request
    and tr.status = 'looking'
    and tr.class_id is null
    and (
      tr.request_scope = 'open_opportunity'
      or tr.opportunity_name is not null
    );

  if target_row.id is null then
    raise exception 'Open Collab request not found.';
  end if;

  if target_row.profile_id = joining_profile then
    raise exception 'You cannot join your own request.';
  end if;

  -- get_request_matched_teammate_count returns only the matched-teammate
  -- delta. B1's current_members is the authoritative total, including the
  -- request baseline, so use that for capacity.
  select coalesce(status.current_members, 0)
    into current_members
  from public.get_team_request_component_status_b1(target_row.id) status;

  if current_members >= coalesce(target_row.total_team_size, target_row.members_needed + 1, 2) then
    raise exception 'Team is already full.';
  end if;

  if exists (
    with recursive component_requests(request_id) as (
      select target_request

      union

      select case
        when rel.request_a_id = cr.request_id then rel.request_b_id
        else rel.request_a_id
      end
      from component_requests cr
      join public.teammate_relationships rel
        on rel.status = 'active'
       and rel.request_a_id is not null
       and rel.request_b_id is not null
       and (rel.request_a_id = cr.request_id or rel.request_b_id = cr.request_id)
      join public.connections c on c.id = rel.connection_id
      where c.status = 'accepted'
        and c.relationship_type = 'teammate'
    )
    select 1
    from public.teammate_relationships rel
    join public.connections c on c.id = rel.connection_id
    where rel.status = 'active'
      and c.status = 'accepted'
      and c.relationship_type = 'teammate'
      and (
        rel.request_a_id in (select request_id from component_requests)
        or rel.request_b_id in (select request_id from component_requests)
      )
      and joining_profile in (rel.profile_a_id, rel.profile_b_id)
  ) then
    raise exception 'You are already a teammate on this request.';
  end if;

  select c.* into existing_connection
  from public.connections c
  where c.sender_profile_id = joining_profile
    and c.receiver_profile_id = target_row.profile_id
    and c.receiver_team_request_id = target_row.id
    and c.connection_context = 'team_request'
    and c.status in ('pending', 'accepted')
  order by c.updated_at desc, c.created_at desc
  limit 1;

  if existing_connection.id is not null then
    return query select existing_connection.id, existing_connection.status;
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
    joining_profile,
    target_row.profile_id,
    null,
    target_row.id,
    'team_request',
    'teammate',
    nullif(trim(coalesce(intro_message, '')), ''),
    'pending'
  )
  returning * into created_connection;

  perform public.create_notification(
    target_row.profile_id,
    joining_profile,
    'connection_request',
    created_connection.id,
    null
  );

  return query select created_connection.id, created_connection.status;
end;
$function$;

revoke all on function public.request_to_join_team_request(uuid, uuid, text) from public;
revoke all on function public.request_to_join_team_request(uuid, uuid, text) from anon;
grant execute on function public.request_to_join_team_request(uuid, uuid, text) to authenticated;

-- 2. Request-specific read path for the later frontend state display.
--    This never falls back to a generic friendship between the profiles.
create or replace function public.get_team_request_join_state(
  target_request uuid,
  joining_profile uuid
)
returns table(
  id uuid,
  status text,
  connection_context text,
  relationship_type text
)
language sql
security definer
stable
set search_path = public
as $function$
  select
    c.id,
    c.status,
    c.connection_context,
    c.relationship_type
  from public.connections c
  where public.owns_profile(joining_profile)
    and c.sender_profile_id = joining_profile
    and c.sender_team_request_id is null
    and c.receiver_team_request_id = target_request
    and c.connection_context = 'team_request'
  order by c.updated_at desc, c.created_at desc
  limit 1;
$function$;

revoke all on function public.get_team_request_join_state(uuid, uuid) from public;
revoke all on function public.get_team_request_join_state(uuid, uuid) from anon;
grant execute on function public.get_team_request_join_state(uuid, uuid) to authenticated;

-- 3. Preserve the deployed respond_connection_request contract exactly:
--    (uuid, uuid, text) returns TABLE(id uuid, status text).
--
-- The added branch handles a direct Collab join whose target request is in
-- receiver_team_request_id and whose sender_team_request_id is NULL. The
-- existing sender-request and generic Friend branches remain intact.
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
  receiver_request uuid;
  current_members integer;
  target_request_row public.team_requests;
begin
  if response_status not in ('accepted', 'declined') then
    raise exception 'Invalid connection response.';
  end if;

  if not public.owns_profile(receiver_profile) then
    raise exception 'Receiver profile ownership required.';
  end if;

  if response_status = 'accepted' then
    -- Validate all request-specific links before changing status.
    select c.* into updated_connection
    from public.connections c
    where c.id = connection_request
      and c.receiver_profile_id = receiver_profile
      and c.status = 'pending';

    if updated_connection.id is null then
      return;
    end if;

    if updated_connection.sender_team_request_id is not null then
      select receiver_row.id into receiver_request
      from public.team_requests sender_row
      join public.team_requests receiver_row
        on receiver_row.profile_id = receiver_profile
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

      if receiver_request is null then
        raise exception 'No compatible active team request found for receiver.';
      end if;

      update public.connections c
      set
        status = 'accepted',
        accepted_at = coalesce(c.accepted_at, now()),
        updated_at = now(),
        receiver_team_request_id = receiver_request,
        relationship_type = 'teammate',
        connection_context = 'team_request'
      where c.id = updated_connection.id
      returning * into updated_connection;

      insert into public.teammate_relationships (
        connection_id,
        profile_a_id,
        profile_b_id,
        request_a_id,
        request_b_id,
        status
      )
      select
        updated_connection.id,
        updated_connection.sender_profile_id,
        updated_connection.receiver_profile_id,
        updated_connection.sender_team_request_id,
        updated_connection.receiver_team_request_id,
        'active'
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
    elsif updated_connection.receiver_team_request_id is not null then
      -- Direct Collab join: the receiver owns the target request and the
      -- joining profile does not need a separate request.
      -- Serialize direct-join acceptance for this exact request. The lock
      -- remains held through the B1 capacity check and relationship insert.
      select tr.* into target_request_row
      from public.team_requests tr
      where tr.id = updated_connection.receiver_team_request_id
        and tr.profile_id = receiver_profile
        and tr.status = 'looking'
        and tr.class_id is null
        and (
          tr.request_scope = 'open_opportunity'
          or tr.opportunity_name is not null
        )
      for update;

      if target_request_row.id is null then
        raise exception 'Target team request is no longer active.';
      end if;

      select coalesce(status.current_members, 0)
        into current_members
      from public.get_team_request_component_status_b1(
        updated_connection.receiver_team_request_id
      ) status;

      if current_members >= (
        select coalesce(tr.total_team_size, tr.members_needed + 1, 2)
        from public.team_requests tr
        where tr.id = updated_connection.receiver_team_request_id
      ) then
        raise exception 'Team is already full.';
      end if;

      update public.connections c
      set
        status = 'accepted',
        accepted_at = coalesce(c.accepted_at, now()),
        updated_at = now(),
        relationship_type = 'teammate',
        connection_context = 'team_request'
      where c.id = updated_connection.id
      returning * into updated_connection;

      insert into public.teammate_relationships (
        connection_id,
        profile_a_id,
        profile_b_id,
        request_a_id,
        request_b_id,
        status
      )
      select
        updated_connection.id,
        -- The live constraint requires canonical profile ordering. B1 treats
        -- request IDs and profile IDs as separate relationship attributes, so
        -- request_a_id remains the target request even when its owner is not
        -- the lexicographically smaller profile ID.
        least(updated_connection.sender_profile_id, updated_connection.receiver_profile_id),
        greatest(updated_connection.sender_profile_id, updated_connection.receiver_profile_id),
        updated_connection.receiver_team_request_id,
        null,
        'active'
      where not exists (
        select 1
        from public.teammate_relationships rel
        where rel.status = 'active'
          and (
            rel.connection_id = updated_connection.id
            or (
              rel.request_a_id = updated_connection.receiver_team_request_id
              and updated_connection.sender_profile_id in (rel.profile_a_id, rel.profile_b_id)
              and updated_connection.receiver_profile_id in (rel.profile_a_id, rel.profile_b_id)
            )
          )
      )
      on conflict do nothing;
    else
      -- Preserve existing generic Discover/Friend acceptance behavior.
      update public.connections c
      set
        status = 'accepted',
        accepted_at = coalesce(c.accepted_at, now()),
        updated_at = now(),
        relationship_type = 'friend',
        connection_context = 'discover'
      where c.id = updated_connection.id
      returning * into updated_connection;
    end if;

    perform public.create_notification(
      updated_connection.sender_profile_id,
      receiver_profile,
      'connection_accepted',
      updated_connection.id,
      null
    );
  else
    update public.connections c
    set
      status = response_status,
      accepted_at = c.accepted_at,
      updated_at = now()
    where c.id = connection_request
      and c.receiver_profile_id = receiver_profile
      and c.status = 'pending'
    returning * into updated_connection;

    if updated_connection.id is null then
      return;
    end if;

    perform public.create_notification(
      updated_connection.sender_profile_id,
      receiver_profile,
      'connection_declined',
      updated_connection.id,
      null
    );
  end if;

  return query select updated_connection.id, updated_connection.status;
end;
$function$;

grant execute on function public.respond_connection_request(uuid, uuid, text) to authenticated;
