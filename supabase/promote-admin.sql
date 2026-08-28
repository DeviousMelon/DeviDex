-- 1. Sign up through DeviDex first.
-- 2. Supabase -> Authentication -> Users -> copy your user UUID.
-- 3. Replace YOUR-USER-UUID below and run this once in SQL Editor.
--
-- We intentionally do NOT make "first registered user = admin" in frontend
-- code. Explicit database promotion is safer.

update public.profiles
set role = 'admin'
where id = 'YOUR-USER-UUID'::uuid;

select id, username, role
from public.profiles
where id = 'YOUR-USER-UUID'::uuid;
