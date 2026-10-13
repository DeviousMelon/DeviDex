-- DeviDex v1.6 verification. Read-only.
-- Every row should say ok = true.
select check_name, ok
from (values
  ('friendships table exists', to_regclass('public.friendships') is not null),
  ('user_blocks table exists', to_regclass('public.user_blocks') is not null),
  ('reports table exists', to_regclass('public.reports') is not null),
  ('RLS on friendships', (select relrowsecurity from pg_class where oid = 'public.friendships'::regclass)),
  ('RLS on user_blocks', (select relrowsecurity from pg_class where oid = 'public.user_blocks'::regclass)),
  ('RLS on reports', (select relrowsecurity from pg_class where oid = 'public.reports'::regclass)),
  ('browser cannot write friendships', not has_table_privilege('authenticated', 'public.friendships', 'INSERT, UPDATE, DELETE')),
  ('browser cannot write blocks', not has_table_privilege('authenticated', 'public.user_blocks', 'INSERT, UPDATE, DELETE')),
  ('browser cannot write reports', not has_table_privilege('authenticated', 'public.reports', 'INSERT, UPDATE, DELETE')),
  ('visitors cannot read friendships', not has_table_privilege('anon', 'public.friendships', 'SELECT')),
  ('helpers are private', not has_function_privilege('authenticated', 'public.are_friends(uuid, uuid)', 'EXECUTE')
                          and not has_function_privilege('authenticated', 'public.is_blocked_between(uuid, uuid)', 'EXECUTE')),
  ('visitors cannot send requests', not has_function_privilege('anon', 'public.send_friend_request(text)', 'EXECUTE')),
  ('signed-in users can send requests', has_function_privilege('authenticated', 'public.send_friend_request(text)', 'EXECUTE')),
  ('report queue function exists', to_regprocedure('public.get_reports(text)') is not null)
) as checks(check_name, ok);

select
  (select count(*) from public.friendships where status = 'accepted') as friendships,
  (select count(*) from public.friendships where status = 'pending') as pending_requests,
  (select count(*) from public.user_blocks) as blocks,
  (select count(*) from public.reports where status = 'open') as open_reports;
