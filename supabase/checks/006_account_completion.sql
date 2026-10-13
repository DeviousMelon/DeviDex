-- DeviDex v0.7 verification

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name = 'username_changed_at';

select trigger_name
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'profiles'
  and trigger_name = 'profiles_username_change_cooldown';

select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname in (
    'Users can read own avatar metadata',
    'Users can upload own avatar',
    'Users can update own avatar',
    'Users can delete own avatar'
  )
order by policyname;
