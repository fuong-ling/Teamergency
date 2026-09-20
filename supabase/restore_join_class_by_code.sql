-- Restore the RPC expected by the frontend without duplicating class-join logic.
-- Run manually in the correct production Supabase project.

create or replace function public.join_class_by_code(
  class_code text,
  current_profile uuid,
  preferred_teammate_status text default null
)
returns table(
  id uuid,
  class_id uuid,
  profile_id uuid,
  network_status text,
  joined_at timestamptz,
  class_data jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_class_id uuid;
  matching_class_count integer;
begin
  if not public.owns_profile(current_profile) then
    raise exception 'Profile ownership required.';
  end if;

  select count(*)::integer
    into matching_class_count
  from public.classes c
  where c.status = 'active'
    and nullif(trim(class_code), '') is not null
    and (
      c.lecturer_access_code = trim(class_code)
      or c.join_code = trim(class_code)
    );

  if matching_class_count = 0 then
    raise exception 'Class code not found.';
  end if;

  if matching_class_count > 1 then
    raise exception 'Multiple active classes match this code.';
  end if;

  select c.id
    into resolved_class_id
  from public.classes c
  where c.status = 'active'
    and (
      c.lecturer_access_code = trim(class_code)
      or c.join_code = trim(class_code)
    );

  return query
  select joined.id,
         joined.class_id,
         joined.profile_id,
         joined.network_status,
         joined.joined_at,
         joined.class_data
  from public.join_class_by_id(
    current_profile,
    resolved_class_id,
    preferred_teammate_status
  ) as joined;
end;
$$;

revoke all on function public.join_class_by_code(text, uuid, text) from public;
grant execute on function public.join_class_by_code(text, uuid, text) to authenticated;
