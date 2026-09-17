-- Teamergency: allow Participants to request to join Collab projects.
--
-- Run manually in Supabase SQL Editor after review.
-- Do not execute this file from the application.
--
-- The requester does not need an academic request, class membership, or a
-- personal Collab request. The target open request is the only project
-- context required. team_request_memberships is the authoritative source
-- for current membership.

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
  if not public.owns_profile(joining_profile) then
    raise exception 'Joining profile ownership required.';
  end if;

  -- Do not require the requester to own a request or have academic context.
  -- The target request is the complete Collab context for this action.
  select tr.*
  into target_row
  from public.team_requests tr
  where tr.id = target_request
    and tr.status = 'looking'
    and tr.profile_id <> joining_profile
    and tr.class_id is null
    and (tr.request_scope = 'open_opportunity' or tr.opportunity_name is not null)
  for update;

  if target_row.id is null then
    raise exception 'Open Collab request not found.';
  end if;

  -- Current membership is authoritative. Historical accepted connections and
  -- ended legacy relationships do not make the user a current member.
  if exists (
    select 1
    from public.team_request_memberships tm
    where tm.team_request_id = target_request
      and tm.member_profile_id = joining_profile
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
  where tm.team_request_id = target_request;

  if current_members >= total_members then
    raise exception 'Team is already full.';
  end if;

  -- Only a current pending request blocks another request. A previous
  -- accepted request is reset to pending after removal/leave; declined or
  -- cancelled history is not an eligibility block.
  select c.*
  into existing_connection
  from public.connections c
  where c.sender_profile_id = joining_profile
    and c.receiver_profile_id = target_row.profile_id
    and c.sender_team_request_id is null
    and c.receiver_team_request_id = target_request
    and c.connection_context = 'team_request'
    and c.status in ('pending', 'accepted')
  order by c.updated_at desc nulls last, c.created_at desc, c.id
  limit 1;

  if existing_connection.id is not null then
    if existing_connection.status = 'pending' then
      return query select existing_connection.id, existing_connection.status;
      return;
    end if;

    -- The accepted row is historical project-request state, not current
    -- membership. Reuse it as a fresh pending request after a kick/leave.
    update public.connections c
    set status = 'pending',
        accepted_at = null,
        intro_message = nullif(trim(coalesce(intro_message, '')), ''),
        updated_at = now()
    where c.id = existing_connection.id
    returning * into existing_connection;

    perform public.create_notification(
      target_row.profile_id,
      joining_profile,
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
    joining_profile,
    target_row.profile_id,
    null,
    target_request,
    'team_request',
    'teammate',
    nullif(trim(coalesce(intro_message, '')), ''),
    'pending'
  )
  returning * into existing_connection;

  perform public.create_notification(
    target_row.profile_id,
    joining_profile,
    'connection_request',
    existing_connection.id,
    null
  );

  return query select existing_connection.id, existing_connection.status;
end;
$function$;

-- Keep the read state aligned with the same current-only eligibility model.
create or replace function public.get_team_request_join_state(
  target_request uuid,
  joining_profile uuid
)
returns table(id uuid, status text, connection_context text, relationship_type text)
language sql
security definer
stable
set search_path = public
as $function$
with states as (
  select
    tm.id,
    'accepted'::text as status,
    'team_request'::text as connection_context,
    'teammate'::text as relationship_type,
    1 as priority
  from public.team_request_memberships tm
  where tm.team_request_id = target_request
    and tm.member_profile_id = joining_profile
    and public.owns_profile(joining_profile)

  union all

  select
    c.id,
    c.status,
    c.connection_context,
    c.relationship_type,
    2 as priority
  from public.connections c
  where c.sender_profile_id = joining_profile
    and c.sender_team_request_id is null
    and c.receiver_team_request_id = target_request
    and c.connection_context = 'team_request'
    and c.status = 'pending'
    and public.owns_profile(joining_profile)
)
select id, status, connection_context, relationship_type
from states
order by priority
limit 1;
$function$;

revoke all on function public.request_to_join_team_request(uuid, uuid, text) from public, anon;
revoke all on function public.get_team_request_join_state(uuid, uuid) from public, anon;
grant execute on function public.request_to_join_team_request(uuid, uuid, text) to authenticated;
grant execute on function public.get_team_request_join_state(uuid, uuid) to authenticated;
