-- =============================================================
-- DeviDex: promote the owner account to admin
-- Admin email: devidex314@gmail.com
--
-- WHEN TO RUN THIS:
-- 1. Run schema.sql first.
-- 2. Create the account through DeviDex using devidex314@gmail.com.
-- 3. Confirm the email if Supabase asks you to.
-- 4. Run THIS file once in Supabase Dashboard -> SQL Editor.
--
-- We promote by email here so you do not need to hunt down/copy a UUID.
-- This SQL runs server-side in Supabase; the email is NOT used as the
-- frontend security check. After promotion, profiles.role is the authority.
-- =============================================================

do $$
declare
  admin_user_id uuid;
begin
  select id
    into admin_user_id
  from auth.users
  where lower(email) = lower('devidex314@gmail.com')
  limit 1;

  if admin_user_id is null then
    raise exception
      'No Supabase Auth user exists for devidex314@gmail.com yet. Create the DeviDex account first.';
  end if;

  update public.profiles
  set role = 'admin'
  where id = admin_user_id;

  if not found then
    raise exception
      'The auth user exists, but no public profile exists. Run schema.sql first, then recreate or repair the profile.';
  end if;
end $$;

-- A small sanity check. The result should show role = admin.
select
  p.id,
  u.email,
  p.username,
  p.display_name,
  p.role,
  p.created_at
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('devidex314@gmail.com');
