-- DeviDex v1.0 / Phase 5 verification
-- Safe to run from the Supabase SQL Editor (where auth.uid() is normally null).

select
  to_regclass('public.user_collection_views') is not null as collection_views_table_exists,
  to_regprocedure('public.activate_own_collection_view(uuid)') is not null as activation_function_exists,
  to_regprocedure('public.update_own_active_collection_definition(text,text,boolean,boolean,boolean,boolean,boolean,boolean)') is not null as atomic_definition_update_exists,
  to_regprocedure('public.export_own_collection_v3()') is not null as backup_v3_export_exists,
  to_regprocedure('public.restore_own_collection_v3(jsonb,jsonb,jsonb,boolean)') is not null as backup_v3_restore_exists;

select
  count(*) as total_saved_setups,
  count(distinct user_id) as accounts_with_setups,
  count(*) filter (where is_active) as total_active_setups
from public.user_collection_views;

-- This should return ZERO rows. Each account must have exactly one active setup.
select user_id, count(*) filter (where is_active) as active_count
from public.user_collection_views
group by user_id
having count(*) filter (where is_active) <> 1;

select
  preset_id,
  goal,
  count(*) as setup_count
from public.user_collection_views
group by preset_id, goal
order by preset_id, goal;

select relrowsecurity as rls_enabled
from pg_class
where oid = 'public.user_collection_views'::regclass;

select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'user_collection_views'
order by policyname;
