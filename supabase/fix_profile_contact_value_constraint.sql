-- Teamergency profile privacy compatibility fix.
-- Run manually in Supabase SQL Editor. Do not execute automatically.
-- Student contact_value is optional in the current onboarding model.

alter table public.profiles
drop constraint if exists profiles_contact_value_required_for_real_users;

alter table public.profiles
drop constraint if exists profiles_check;

alter table public.profiles
drop constraint if exists profiles_contact_value_optional_check;

-- Optional contact means the type must be nullable when no contact is supplied.
-- Keep profiles_contact_type_check in place for non-null values.
alter table public.profiles
alter column contact_type drop not null;

alter table public.profiles
add constraint profiles_contact_value_optional_check
check (
  contact_value is null
  or length(trim(contact_value)) > 0
);
