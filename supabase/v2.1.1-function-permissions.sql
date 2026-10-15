-- =============================================================
-- DeviDex v2.1.1 - function permissions lockdown
-- Already applied to the live project on 2026-10-15 from the SQL Editor.
-- Kept here so the repo can rebuild the database. Safe to rerun.
--
-- Stops signed-out visitors calling signed-in-only functions, and drops
-- the two export functions the app no longer calls. The app only calls
-- export_own_collection_v4. All four restore versions stay: accountData.ts
-- picks one by backup version.
--
-- NOTE: re-running v0.8 or v1.0 recreates export v2/v3. If you ever do,
-- run this file again afterwards.
--
-- Run after v2.1. Then run verify-v2.1.sql.
-- =============================================================

-- 1. Unused old exports (nothing in the app or the database calls them).
drop function if exists public.export_own_collection_v2();
drop function if exists public.export_own_collection_v3();

-- 2. Signed-in-only functions: remove anon (and PUBLIC, which anon inherits from),
--    then grant explicitly to authenticated + service_role so nothing breaks for logged-in users.
do $$
declare f text;
begin
  foreach f in array array[
    'public.activate_own_collection_view(uuid)',
    'public.delete_own_account()',
    'public.export_own_collection_v4()',
    'public.restore_own_collection(jsonb, jsonb, boolean)',
    'public.restore_own_collection_v2(jsonb, jsonb, boolean)',
    'public.restore_own_collection_v3(jsonb, jsonb, jsonb, boolean)',
    'public.restore_own_collection_v4(jsonb, jsonb, jsonb, jsonb, boolean)',
    'public.update_own_active_collection_definition(text, text, boolean, boolean, boolean, boolean, boolean, boolean)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- 3. Trigger functions: nobody should call these over the API. Triggers still fire
--    (Postgres doesn't check EXECUTE when a trigger fires).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.create_default_collection_view_for_profile() from public, anon, authenticated;

-- Left public on purpose (needed while signed out):
--   get_public_profile, get_public_collection_summary, get_relationship, is_username_available,
--   list_forum_categories, list_forum_posts, get_forum_post, get_forum_comments, is_admin
