-- =============================================================
-- DeviDex v0.7.1 - profile save hotfix
-- Run AFTER v0.7-phase2-account-completion.sql.
-- Safe to rerun.
-- =============================================================

-- v0.7 still used a direct browser UPDATE for all profile fields. Once username
-- cooldowns, restricted column grants and avatar policies coexist, one rejected
-- username write can make unrelated changes (avatar/display name/privacy) appear
-- not to save. v0.7.1 separates ordinary profile settings from username changes.

-- -------------------------------------------------------------
-- 1. Ordinary profile settings
-- -------------------------------------------------------------
-- SECURITY: callers never supply a user id. Only auth.uid() can be updated and
-- the function does not accept role/security columns.
create or replace function public.update_own_profile_settings(
  p_display_name text default null,
  p_avatar_path text default null,
  p_home_friend_code text default null,
  p_home_friend_code_public boolean default false,
  p_profile_public boolean default true,
  p_collection_public boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  clean_display_name text := nullif(btrim(p_display_name), '');
  clean_friend_code text := nullif(upper(btrim(p_home_friend_code)), '');
begin
  if current_user_id is null then
    raise exception 'You must be signed in to update a DeviDex profile.';
  end if;

  -- A user may only reference an avatar object inside their own Storage folder.
  if p_avatar_path is not null
     and split_part(p_avatar_path, '/', 1) <> current_user_id::text then
    raise exception 'Invalid avatar path.';
  end if;

  update public.profiles
  set
    display_name = clean_display_name,
    avatar_path = p_avatar_path,
    home_friend_code = clean_friend_code,
    home_friend_code_public = (
      coalesce(p_profile_public, true)
      and clean_friend_code is not null
      and coalesce(p_home_friend_code_public, false)
    ),
    profile_public = coalesce(p_profile_public, true),
    collection_public = (
      coalesce(p_profile_public, true)
      and coalesce(p_collection_public, false)
    )
  where id = current_user_id;

  if not found then
    raise exception 'DeviDex profile row could not be found.';
  end if;
end;
$$;

revoke all on function public.update_own_profile_settings(text, text, text, boolean, boolean, boolean) from public;
grant execute on function public.update_own_profile_settings(text, text, text, boolean, boolean, boolean) to authenticated;

-- -------------------------------------------------------------
-- 2. Username changes
-- -------------------------------------------------------------
-- The existing unique index, format constraint and v0.7 cooldown trigger remain
-- the source of truth. Keeping this as a separate transaction means a rejected
-- username never rolls back an avatar or privacy change.
create or replace function public.change_own_username(p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  clean_username text := nullif(btrim(p_username), '');
begin
  if current_user_id is null then
    raise exception 'You must be signed in to change a DeviDex username.';
  end if;

  if clean_username is null then
    raise exception 'Username is required.';
  end if;

  update public.profiles
  set username = clean_username
  where id = current_user_id;

  if not found then
    raise exception 'DeviDex profile row could not be found.';
  end if;
end;
$$;

revoke all on function public.change_own_username(text) from public;
grant execute on function public.change_own_username(text) to authenticated;

-- Remove the first draft function name if it was ever created while testing.
drop function if exists public.update_own_profile(text, text, text, text, boolean, boolean, boolean);
