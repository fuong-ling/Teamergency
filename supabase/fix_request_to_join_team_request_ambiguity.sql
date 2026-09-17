-- Teamergency: production repair for the 42702 ambiguity in
-- public.request_to_join_team_request.
--
-- Run manually in Supabase SQL Editor after review.
-- Do not execute this file from the application.
-- This replaces only the existing request-to-join RPC. Its signature and
-- return type are unchanged.

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
  current_members integer;
  total_members integer;
begin
  if not public.owns_profile($2) then
    raise exception 'Joining profile ownership required.';
  end if;

  select tr.*
  into target_row
  from public.team_requests tr
  where tr.id = $1
    and tr.status = 'looking'
    and tr.profile_id <> $2
    and tr.class_id is null
    and (tr.request_scope = 'open_opportunity' or tr.opportunity_name is not null)
  for update;

  if target_row.id is null then
    raise exception 'Open Collab request not found.';
  end if;

  -- Current membership is the only Joined state. Historical connections and
  -- ended teammate relationships do not block rejoining.
  if exists (
    select 1
    from public.team_request_memberships tm
    where tm.team_request_id = $1
      and tm.member_profile_id = $2
  ) then
    return query select null::uuid, 'accepted';
    return;
  end if;

  total_members := coalesce(target_row.total_team_size, target_row.members_needed + 1, 2);
  select greatest(
    1,
    coalesce(
      target_row.baseline_member_count,
      total_members - coalesce(target_row.teammates_needed_initial, target_row.members_needed, 1),
      1
    ) + count(tm.id)
  )
  into current_members
  from public.team_request_memberships tm
  where tm.team_request_id = $1;

  if current_members >= total_members then
    raise exception 'Team is already full.';
  end if;

  -- A current pending row blocks duplicates. A historical accepted row is
  -- reset to pending after its membership is gone, allowing reapplication.
  select c.*
  into existing_connection
  from public.connections c
  where c.sender_profile_id = $2
    and c.receiver_profile_id = target_row.profile_id
    and c.sender_team_request_id is null
    and c.receiver_team_request_id = $1
    and c.connection_context = 'team_request'
    and c.status in ('pending', 'accepted')
  order by c.updated_at desc nulls last, c.created_at desc, c.id
  limit 1;

  if existing_connection.id is not null then
    if existing_connection.status = 'pending' then
      return query select existing_connection.id, existing_connection.status;
      return;
    end if;

    update public.connections c
    set status = 'pending',
        accepted_at = null,
        intro_message = nullif(trim(coalesce($3, '')), ''),
        updated_at = now()
    where c.id = existing_connection.id
    returning * into existing_connection;

    perform public.create_notification(
      target_row.profile_id,
      $2,
      'connection_request',
      existing_connection.id,
      null
    );

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
    $2,
    target_row.profile_id,
    null,
    $1,
    'team_request',
    'teammate',
    nullif(trim(coalesce($3, '')), ''),
    'pending'
  )
  returning * into existing_connection;

  perform public.create_notification(
    target_row.profile_id,
    $2,
    'connection_request',
    existing_connection.id,
    null
  );

  return query select existing_connection.id, existing_connection.status;
end;
$function$;

revoke all on function public.request_to_join_team_request(uuid, uuid, text) from public, anon;
grant execute on function public.request_to_join_team_request(uuid, uuid, text) to authenticated;
