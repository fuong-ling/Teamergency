update public.profiles
set full_name = regexp_replace(full_name, '\s*\(Demo\)\s*$', '', 'i')
where is_demo = true
  and full_name ~* '\s*\(Demo\)\s*$';
