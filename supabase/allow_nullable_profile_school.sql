alter table public.profiles
alter column school drop not null;

alter table public.profiles
drop constraint if exists profiles_school_code_check;

alter table public.profiles
add constraint profiles_school_code_check
check (school is null or school in ('SCD', 'TBS', 'SSET'))
not valid;
