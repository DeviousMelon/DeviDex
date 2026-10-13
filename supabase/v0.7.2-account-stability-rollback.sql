-- =============================================================
-- DeviDex v0.7.2 - account stability rollback
--
-- PURPOSE
-- Restore the known-good v0.6 profile update model after the v0.7 username
-- cooldown/RPC changes caused profile fields to stop persisting reliably.
--
-- This migration is intentionally conservative:
--   * remove the username cooldown trigger/function
--   * remove the v0.7.1 profile RPC functions
--   * restore the exact browser UPDATE permissions used by v0.6
--   * leave the username_changed_at column in place (unused, harmless)
--   * preserve every existing profile/collection row
--
-- Safe to rerun.
-- =============================================================

-- 1. Remove the cooldown trigger first so ordinary profile saves can update
--    username using the same direct UPDATE path that worked in v0.6.
drop trigger if exists profiles_username_change_cooldown on public.profiles;
drop function if exists public.enforce_username_change_cooldown();

-- 2. Remove the v0.7.1 RPC layer. The frontend is rolling back to the simpler
--    v0.6 direct profile update path protected by RLS + column privileges.
drop function if exists public.update_own_profile_settings(text, text, text, boolean, boolean, boolean);
drop function if exists public.change_own_username(text);
drop function if exists public.update_own_profile(text, text, text, text, boolean, boolean, boolean);

-- 3. Reassert the known-good RLS policy from v0.5/v0.6.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- 4. Reassert the exact non-security columns a signed-in browser may update.
--    IMPORTANT: role is deliberately not included.
revoke update on public.profiles from authenticated;
grant update (
  username,
  display_name,
  avatar_path,
  home_friend_code,
  home_friend_code_public,
  profile_public,
  collection_public
) on public.profiles to authenticated;

grant select on public.profiles to authenticated;

-- 5. Keep the avatar SELECT policy that fixed Storage upserts in v0.6.1.
drop policy if exists "Users can read own avatar object" on storage.objects;
drop policy if exists "Users can read own avatar metadata" on storage.objects;
create policy "Users can read own avatar metadata"
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
