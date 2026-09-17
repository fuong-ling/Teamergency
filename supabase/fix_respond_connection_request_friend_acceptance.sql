-- Teamergency: keep friend acceptance independent from team-request matching.
--
-- Run manually in Supabase SQL Editor after review.
-- This migration does not execute SQL or mutate production data by itself.
-- The RPC signature and return contract remain unchanged:
--   respond_connection_request(uuid, uuid, text)
--   returns TABLE(id uuid, status text)

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
    select c.* into updated_connection
    from public.connections c
    where c.id = connection_request
      and c.receiver_profile_id = receiver_profile
      and c.status = 'pending';

    if updated_connection.id is null then
      return;
    end if;

    -- A friend relationship remains a friend even when the request was
    -- initiated from a team-request context or has one-sided request IDs.
    -- Those fields are metadata and must not force team compatibility checks
    -- or create teammate membership.
    if coalesce(updated_connection.relationship_type, 'friend') = 'teammate'
      and updated_connection.sender_team_request_id is not null then
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
    elsif coalesce(updated_connection.relationship_type, 'friend') = 'teammate'
      and updated_connection.receiver_team_request_id is not null then
      -- Direct Collab join: the receiver owns the target request and the
      -- joining profile does not need a separate request.
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
      -- Friend acceptance is intentionally independent of team compatibility.
      -- Preserve connection_context and request IDs as historical metadata.
      update public.connections c
      set
        status = 'accepted',
        accepted_at = coalesce(c.accepted_at, now()),
        updated_at = now(),
        relationship_type = 'friend'
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
