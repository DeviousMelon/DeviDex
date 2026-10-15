-- DeviDex v0.8 Phase 3 verification

-- Expected: 1 row for each function below.
-- Since v2.1.1, export_own_collection_v2 is deliberately dropped, so expect
-- only the two restore functions here.
select proname
from pg_proc
join pg_namespace n on n.oid = pg_proc.pronamespace
where n.nspname = 'public'
  and proname in (
    'export_own_collection_v2',
    'restore_own_collection_v2',
    'restore_own_collection'
  )
order by proname;

-- Expected: 4 policies on each private collection table.
select tablename, count(*) as policy_count
from pg_policies
where schemaname = 'public'
  and tablename in ('collection_progress', 'game_collection_progress')
group by tablename
order by tablename;

-- Expected: RLS true for both tables.
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
join pg_namespace n on n.oid = pg_class.relnamespace
where n.nspname = 'public'
  and relname in ('collection_progress', 'game_collection_progress')
order by relname;
