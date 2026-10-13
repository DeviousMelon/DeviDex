-- DeviDex v0.7.1 verification
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('update_own_profile_settings', 'change_own_username')
order by p.proname;
