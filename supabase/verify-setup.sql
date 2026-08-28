-- DeviDex Supabase setup check.
-- Run this in Supabase SQL Editor whenever you want to confirm the auth
-- foundation is present and the owner account has the expected role.

select
  u.email,
  p.username,
  p.role,
  u.email_confirmed_at is not null as email_confirmed,
  p.created_at
from auth.users u
left join public.profiles p on p.id = u.id
where lower(u.email) = lower('devidex314@gmail.com');
