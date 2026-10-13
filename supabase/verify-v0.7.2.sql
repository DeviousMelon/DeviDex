-- DeviDex v0.7.2 verification
-- Expected:
--   cooldown_trigger_count = 0
--   old_rpc_count = 0
--   own_update_policy_count = 1
--   avatar_select_policy_count = 1

select
  (select count(*) from pg_trigger
   where tgname = 'profiles_username_change_cooldown' and not tgisinternal) as cooldown_trigger_count,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('update_own_profile_settings', 'change_own_username')) as old_rpc_count,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'Users can update own profile') as own_update_policy_count,
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Users can read own avatar metadata') as avatar_select_policy_count;
