-- DeviDex v1.8 verification. Read-only.
-- Every row should say ok = true.
select check_name, ok
from (values
  ('messages can carry a Pokémon', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'pokemon_form_id')),
  ('only one send_message() exists', (select count(*) from pg_proc where proname = 'send_message' and pronamespace = 'public'::regnamespace) = 1),
  ('friends-visibility column exists', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'collection_friends_visible')),
  ('users can change friends-visibility', has_column_privilege('authenticated', 'public.profiles', 'collection_friends_visible', 'UPDATE')),
  ('users still cannot change role', not has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')),
  ('trade_list table exists', to_regclass('public.trade_list') is not null),
  ('RLS on trade_list', (select relrowsecurity from pg_class where oid = 'public.trade_list'::regclass)),
  ('visitors cannot read trade lists', not has_table_privilege('anon', 'public.trade_list', 'SELECT')),
  ('compare function exists', to_regprocedure('public.compare_collection_with_friend(text)') is not null)
) as checks(check_name, ok);

select
  (select count(*) from public.trade_list) as trade_list_entries,
  (select count(*) from public.messages where pokemon_form_id is not null) as shared_pokemon,
  (select count(*) from public.profiles where not collection_friends_visible) as hiding_from_friends;
