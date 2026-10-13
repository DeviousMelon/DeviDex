-- DeviDex v0.6 verification helpers
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name = 'collection_public';

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'get_public_collection_summary',
    'delete_own_account',
    'restore_own_collection'
  )
order by routine_name;
