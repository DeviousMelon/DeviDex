-- =============================================================
-- DeviDex v0.5 - public account/profile foundation
--
-- Run AFTER the v0.3 and v0.4 migrations.
-- Safe to rerun during development.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Expand profiles
-- -------------------------------------------------------------
alter table public.profiles
  add column if not exists avatar_path text,
  add column if not exists home_friend_code text,
  add column if not exists home_friend_code_public boolean not null default false,
  add column if not exists profile_public boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

-- Usernames are public handles, so DeviDex treats case variants as identical:
-- Devi, devi and DEVI cannot be three different accounts.
create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;

-- Keep handles predictable enough to use safely in /u/:username URLs.
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format check (
    username is null or (
      username ~ '^[A-Za-z0-9_-]{3,20}$'
      and lower(username) not in (
        'admin', 'administrator', 'devidex', 'support', 'moderator',
        'official', 'system', 'staff', 'help', 'security'
      )
    )
  );

-- Reuse/create the normal updated_at helper.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

-- -------------------------------------------------------------
-- 2. Let users edit ONLY their own non-security profile fields
-- -------------------------------------------------------------
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Column privileges matter here. Everyone logged in uses the PostgreSQL role
-- `authenticated`, including admins, so do NOT grant browser clients permission
-- to update profiles.role. Admin promotion remains an SQL/admin operation.
revoke update on public.profiles from authenticated;
grant update (
  username,
  display_name,
  avatar_path,
  home_friend_code,
  home_friend_code_public,
  profile_public
) on public.profiles to authenticated;

-- Existing own-profile SELECT policy from v0.2 continues to protect private
-- fields such as the HOME code when a user has not chosen to publish it.
grant select on public.profiles to authenticated;

-- -------------------------------------------------------------
-- 3. Username availability without exposing private profiles
-- -------------------------------------------------------------
create or replace function public.is_username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    candidate is not null
    and btrim(candidate) ~ '^[A-Za-z0-9_-]{3,20}$'
    and lower(btrim(candidate)) not in (
      'admin', 'administrator', 'devidex', 'support', 'moderator',
      'official', 'system', 'staff', 'help', 'security'
    )
    and not exists (
      select 1
      from public.profiles p
      where p.username is not null
        and lower(p.username) = lower(btrim(candidate))
        and p.id is distinct from auth.uid()
    );
$$;

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- -------------------------------------------------------------
-- 4. Safe public-profile reader
-- -------------------------------------------------------------
-- Public visitors never receive direct SELECT permission on profiles. This
-- function returns a deliberately small public shape and suppresses the HOME
-- friend code unless the owner explicitly opted to show it.
create or replace function public.get_public_profile(candidate text)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text,
  home_friend_code text,
  home_friend_code_public boolean,
  profile_public boolean,
  role text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_path,
    case when p.home_friend_code_public then p.home_friend_code else null end,
    p.home_friend_code_public,
    p.profile_public,
    p.role,
    p.created_at,
    p.updated_at
  from public.profiles p
  where p.username is not null
    and p.profile_public = true
    and lower(p.username) = lower(btrim(candidate))
  limit 1;
$$;

revoke all on function public.get_public_profile(text) from public;
grant execute on function public.get_public_profile(text) to anon, authenticated;

-- -------------------------------------------------------------
-- 5. Avatar Storage bucket
-- -------------------------------------------------------------
-- Public means the final avatar image can be displayed without generating a
-- signed URL on every page. Upload/edit permission is still restricted below.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Files are stored as <user UUID>/avatar. A user can only mutate objects under
-- their own UUID folder, even if they hand-craft Storage API requests.
drop policy if exists "Users can upload own avatar" on storage.objects;
create policy "Users can upload own avatar"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own avatar" on storage.objects;
create policy "Users can update own avatar"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own avatar" on storage.objects;
create policy "Users can delete own avatar"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
