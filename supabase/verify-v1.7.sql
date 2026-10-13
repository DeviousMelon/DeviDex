-- DeviDex v1.7 verification. Read-only.
-- Every row should say ok = true.
select check_name, ok
from (values
  ('conversations table exists', to_regclass('public.conversations') is not null),
  ('conversation_members table exists', to_regclass('public.conversation_members') is not null),
  ('messages table exists', to_regclass('public.messages') is not null),
  ('RLS on conversations', (select relrowsecurity from pg_class where oid = 'public.conversations'::regclass)),
  ('RLS on conversation_members', (select relrowsecurity from pg_class where oid = 'public.conversation_members'::regclass)),
  ('RLS on messages', (select relrowsecurity from pg_class where oid = 'public.messages'::regclass)),
  ('browser cannot write messages', not has_table_privilege('authenticated', 'public.messages', 'INSERT, UPDATE, DELETE')),
  ('browser cannot write memberships', not has_table_privilege('authenticated', 'public.conversation_members', 'INSERT, UPDATE, DELETE')),
  ('visitors cannot read messages', not has_table_privilege('anon', 'public.messages', 'SELECT')),
  ('messages are live (Realtime)', exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages')),
  ('memberships are live (Realtime)', exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'conversation_members')),
  ('friendships are live (Realtime)', exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'friendships')),
  ('chat helpers are private', not has_function_privilege('authenticated', 'public.chat_resolve_friends(uuid, text[])', 'EXECUTE')),
  -- v1.8 adds Pokémon arguments to send_message(), so check by name.
  ('signed-in users can send messages', exists (select 1 from pg_proc p where p.proname = 'send_message' and p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'EXECUTE')))
) as checks(check_name, ok);

select
  (select count(*) from public.conversations where kind = 'direct') as direct_chats,
  (select count(*) from public.conversations where kind = 'group') as group_chats,
  (select count(*) from public.messages where kind = 'text') as messages;
