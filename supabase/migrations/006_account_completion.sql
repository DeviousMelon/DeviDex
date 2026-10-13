-- =============================================================
-- DeviDex v0.7 - Phase 2 account/profile completion
-- Run AFTER migrations/005_account_safety_and_backups.sql.
-- Safe to rerun during development.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Username-change cooldown
-- -------------------------------------------------------------
-- Initial username setup does NOT start the cooldown. The first later change
-- is allowed at any time; after that, substantive username changes are limited
-- to once every 30 days. Case-only changes do not count as a new identity.
alter table public.profiles
  add column if not exists username_changed_at timestamptz;

create or replace function public.enforce_username_change_cooldown()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Null -> first username is onboarding, not a "change".
  if old.username is null and new.username is not null then
    new.username_changed_at := null;
    return new;
  end if;

  -- Once onboarding has assigned a username, do not let browser clients clear
  -- it back to NULL to bypass the rename cooldown. Account deletion is the
  -- supported way to remove the public handle entirely.
  if old.username is not null and new.username is null then
    raise exception 'Username cannot be cleared once profile setup is complete.';
  end if;

  -- Only a case-insensitively different username starts/enforces cooldown.
  if old.username is not null
     and new.username is not null
     and lower(old.username) is distinct from lower(new.username) then

    if old.username_changed_at is not null
       and old.username_changed_at > now() - interval '30 days' then
      raise exception 'Username can only be changed once every 30 days. Next change is available on %.',
        (old.username_changed_at + interval '30 days')::date;
    end if;

    new.username_changed_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_username_change_cooldown on public.profiles;
create trigger profiles_username_change_cooldown
before update of username on public.profiles
for each row execute procedure public.enforce_username_change_cooldown();

-- Browser users may read the timestamp as part of their own profile, but they
-- deliberately do NOT receive UPDATE permission for it.
grant select on public.profiles to authenticated;

-- -------------------------------------------------------------
-- 2. Storage SELECT policy needed for avatar upsert/removal workflow
-- -------------------------------------------------------------
-- v0.6.1 hotfix made avatar upsert work. Including it here makes a fresh v0.7
-- migration chain self-contained for anyone setting DeviDex up later.
drop policy if exists "Users can read own avatar object" on storage.objects;
drop policy if exists "Users can read own avatar metadata" on storage.objects;
create policy "Users can read own avatar metadata"
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
