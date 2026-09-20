-- Allow Participant profiles to omit academic institution data.
-- Run manually in Supabase; this migration does not change existing rows.

alter table public.profiles
  alter column university drop not null;
