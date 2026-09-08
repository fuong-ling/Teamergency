-- Teamergency: persist the creation-time numeric team baseline.
--
-- baseline_member_count means the number of people already represented by a
-- request before Teamergency-added matches are included.
--
-- Existing rows are initialized once from the best numeric state available at
-- migration time. Because teammates_needed_initial was historically editable,
-- this is a migration-time snapshot, not a reconstruction of the original
-- historical value.

alter table public.team_requests
  add column if not exists baseline_member_count integer;

-- One-time snapshot for existing requests. Never recalculate populated rows.
update public.team_requests tr
set baseline_member_count = greatest(
  1,
  coalesce(tr.total_team_size, tr.members_needed + 1, 2)
    - coalesce(tr.teammates_needed_initial, tr.members_needed, 1)
)
where tr.baseline_member_count is null;

-- Covers every current request-creation RPC, including open-opportunity RPCs
-- whose definitions are maintained outside this repository. The trigger uses
-- the actual inserted row, so RPC signatures and existing side effects remain
-- unchanged.
create or replace function public.set_team_request_baseline_member_count()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if tg_op = 'INSERT' then
    new.baseline_member_count := greatest(
      1,
      coalesce(new.total_team_size, new.members_needed + 1, 2)
        - coalesce(new.teammates_needed_initial, new.members_needed, 1)
    );
  else
    -- The baseline is immutable. Request edits may change the current
    -- search inputs, but must never change the creation-time snapshot.
    new.baseline_member_count := coalesce(
      old.baseline_member_count,
      greatest(
        1,
        coalesce(old.total_team_size, old.members_needed + 1, 2)
          - coalesce(old.teammates_needed_initial, old.members_needed, 1)
      )
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists set_team_request_baseline_member_count_trigger
on public.team_requests;

create trigger set_team_request_baseline_member_count_trigger
before insert or update on public.team_requests
for each row
execute function public.set_team_request_baseline_member_count();

revoke all on function public.set_team_request_baseline_member_count() from public;
