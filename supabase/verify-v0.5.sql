-- DeviDex v0.5 quick verification
select
  username,
  avatar_path,
  home_friend_code,
  home_friend_code_public,
  profile_public,
  role,
  updated_at
from public.profiles
order by created_at;

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'avatars';
