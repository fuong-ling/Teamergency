-- Teamergency: pending connection request message management.
-- Safe additive migration. It does not delete data or change existing tables.

create or replace function public.update_pending_connection_message(
  connection_request uuid,
  sender_profile uuid,
  intro_message text
)
returns table(
  id uuid,
  intro_message text,
  status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.owns_profile(sender_profile) then
    raise exception 'Profile ownership required.';
  end if;

  return query
  update public.connections c
  set
    intro_message = nullif(trim(coalesce(update_pending_connection_message.intro_message, '')), ''),
    updated_at = now()
  where c.id = connection_request
    and c.sender_profile_id = sender_profile
    and c.status = 'pending'
  returning c.id, c.intro_message, c.status, c.updated_at;
end;
$$;

revoke all on function public.update_pending_connection_message(uuid, uuid, text) from public;
grant execute on function public.update_pending_connection_message(uuid, uuid, text) to anon, authenticated;
