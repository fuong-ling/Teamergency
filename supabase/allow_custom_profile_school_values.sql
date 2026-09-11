begin;

alter table public.profiles
drop constraint if exists profiles_school_code_check;

alter table public.profiles
add constraint profiles_school_nonempty_check
check (length(trim(school)) > 0)
not valid;

commit;
