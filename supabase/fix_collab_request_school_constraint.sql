begin;

-- The constraint name is legacy; the constrained column is team_requests.school.
-- Open competition/collab requests may use any non-empty school value, while
-- class requests continue to use the legacy RMIT school codes.
alter table public.team_requests
drop constraint if exists team_requests_school_code_check;

alter table public.team_requests
add constraint team_requests_school_value_check
check (
  school is null
  or (
    class_id is null
    and length(trim(school)) > 0
  )
  or (
    class_id is not null
    and school in ('SCD', 'TBS', 'SSET')
  )
)
not valid;

commit;
