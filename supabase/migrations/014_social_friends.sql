-- =============================================================
-- DeviDex v1.6 - Social phase 1: friends, blocking and reports
--
-- Run AFTER v1.2. Safe to rerun during development.
--
-- Design notes
-- - The browser never inserts or updates these tables directly. Every write
--   goes through a SECURITY DEFINER function that checks who is asking, so a
--   hand-crafted API request cannot accept someone else's friend request or
--   befriend a person who blocked them.
-- - Other people's profiles are still not directly readable. Friend lists are
--   returned by functions that hand back a small, safe profile shape.
-- - Supabase grants new tables/functions to anon + authenticated by default,
--   so every object below explicitly revokes first and grants back only what
--   the browser needs.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Friendships
-- -------------------------------------------------------------
-- One row per pair of collectors. A pending row is a request from requester to
-- addressee; accepting flips it to 'accepted'. Declining or unfriending deletes
-- the row, so either person can send a fresh request later.
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendships_not_self check (requester_id <> addressee_id)
);

-- Devi -> Ash and Ash -> Devi are the same friendship, so uniqueness is on the
-- unordered pair.
create unique index if not exists friendships_pair_unique
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_requester_idx on public.friendships (requester_id, status);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);

alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;

drop policy if exists "Users can read own friendships" on public.friendships;
create policy "Users can read own friendships"
on public.friendships for select to authenticated
using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Live friend-request badges. Realtime applies the SELECT policy above, so
-- people only ever receive changes to their own friendships.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships'
     ) then
    alter publication supabase_realtime add table public.friendships;
  end if;
end;
$$;

-- -------------------------------------------------------------
-- 2. Blocks
-- -------------------------------------------------------------
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from anon, authenticated;
grant select on public.user_blocks to authenticated;

-- You can see who YOU blocked. You can never see who blocked you.
drop policy if exists "Users can read own blocks" on public.user_blocks;
create policy "Users can read own blocks"
on public.user_blocks for select to authenticated
using (auth.uid() = blocker_id);

-- -------------------------------------------------------------
-- 3. Reports
-- -------------------------------------------------------------
-- target_type already lists the chat and forum types used by v1.7 and v1.9 so
-- those phases can extend submit_report() without altering this table.
-- content_snapshot keeps the evidence even if the reported message or post is
-- later deleted. It is captured by the database, never supplied by the browser.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('user', 'message', 'forum_post', 'forum_comment')),
  target_id uuid not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  target_username text,
  content_snapshot text,
  reason text not null check (reason in ('spam', 'harassment', 'inappropriate', 'scam', 'impersonation', 'other')),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

create index if not exists reports_status_created_idx on public.reports (status, created_at desc);
create index if not exists reports_reporter_created_idx on public.reports (reporter_id, created_at desc);
-- Reporting the same thing twice while the first report is open does nothing.
create unique index if not exists reports_one_open_per_target
  on public.reports (reporter_id, target_type, target_id)
  where status = 'open';

alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
grant select on public.reports to authenticated;

drop policy if exists "Admins can read reports" on public.reports;
create policy "Admins can read reports"
on public.reports for select to authenticated
using (public.is_admin());

-- -------------------------------------------------------------
-- 4. Internal helpers (not callable from the browser)
-- -------------------------------------------------------------
create or replace function public.social_current_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'You must be signed in to do that.';
  end if;

  if not exists (select 1 from public.profiles p where p.id = me and p.username is not null) then
    raise exception 'Choose a username on your Account page first.';
  end if;

  return me;
end;
$$;

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id = a and ub.blocked_id = b)
       or (ub.blocker_id = b and ub.blocked_id = a)
  );
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester_id, f.addressee_id) = least(a, b)
      and greatest(f.requester_id, f.addressee_id) = greatest(a, b)
  );
$$;

revoke all on function public.social_current_user() from public, anon, authenticated;
revoke all on function public.is_blocked_between(uuid, uuid) from public, anon, authenticated;
revoke all on function public.are_friends(uuid, uuid) from public, anon, authenticated;

-- -------------------------------------------------------------
-- 5. Friend requests
-- -------------------------------------------------------------
-- Returns: 'requested', 'accepted' (they had already asked you, so this
-- accepts), 'already_requested' or 'already_friends'.
create or replace function public.send_friend_request(target_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.social_current_user();
  target uuid;
  existing public.friendships%rowtype;
begin
  select p.id into target
  from public.profiles p
  where p.username is not null
    and lower(p.username) = lower(btrim(target_username));

  if target is null then
    raise exception 'No collector has that username.';
  end if;

  if target = me then
    raise exception 'You cannot send a friend request to yourself.';
  end if;

  -- Deliberately the same wording whichever side did the blocking, so a
  -- blocked person cannot work out that they were blocked.
  if public.is_blocked_between(me, target) then
    raise exception 'You cannot send a friend request to this collector.';
  end if;

  select * into existing
  from public.friendships f
  where least(f.requester_id, f.addressee_id) = least(me, target)
    and greatest(f.requester_id, f.addressee_id) = greatest(me, target)
  for update;

  if found then
    if existing.status = 'accepted' then
      return 'already_friends';
    elsif existing.requester_id = me then
      return 'already_requested';
    else
      update public.friendships
      set status = 'accepted', responded_at = now()
      where id = existing.id;
      return 'accepted';
    end if;
  end if;

  if (select count(*) from public.friendships f where f.requester_id = me and f.status = 'pending') >= 100 then
    raise exception 'You have 100 requests waiting for replies. Give people a chance to answer first.';
  end if;

  insert into public.friendships (requester_id, addressee_id)
  values (me, target);

  return 'requested';
exception
  -- Two simultaneous requests between the same pair: the other one won.
  when unique_violation then
    return 'already_requested';
end;
$$;

create or replace function public.respond_friend_request(request_id uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.social_current_user();
begin
  if accept then
    update public.friendships
    set status = 'accepted', responded_at = now()
    where id = request_id and addressee_id = me and status = 'pending';
  else
    delete from public.friendships
    where id = request_id and addressee_id = me and status = 'pending';
  end if;

  if not found then
    raise exception 'That friend request no longer exists.';
  end if;
end;
$$;

-- Unfriend, or cancel a request you sent, or quietly decline one you received.
create or replace function public.remove_friend(other_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'You must be signed in to do that.';
  end if;

  delete from public.friendships f
  where least(f.requester_id, f.addressee_id) = least(me, other_user)
    and greatest(f.requester_id, f.addressee_id) = greatest(me, other_user);
end;
$$;

-- -------------------------------------------------------------
-- 6. Blocking
-- -------------------------------------------------------------
-- Blocking also ends any friendship or pending request. Later phases make sure
-- blocked people cannot message you either.
create or replace function public.block_user(other_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'You must be signed in to do that.';
  end if;

  if other_user = me then
    raise exception 'You cannot block yourself.';
  end if;

  if not exists (select 1 from public.profiles p where p.id = other_user) then
    raise exception 'That collector no longer exists.';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (me, other_user)
  on conflict do nothing;

  delete from public.friendships f
  where least(f.requester_id, f.addressee_id) = least(me, other_user)
    and greatest(f.requester_id, f.addressee_id) = greatest(me, other_user);
end;
$$;

create or replace function public.unblock_user(other_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'You must be signed in to do that.';
  end if;

  delete from public.user_blocks
  where blocker_id = me and blocked_id = other_user;
end;
$$;

-- -------------------------------------------------------------
-- 7. Reading your social graph
-- -------------------------------------------------------------
-- relationship: 'friend', 'incoming' (they asked you) or 'outgoing' (you asked).
create or replace function public.get_my_friends()
returns table (
  friendship_id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_path text,
  profile_updated_at timestamptz,
  relationship text,
  since timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    f.id,
    p.id,
    p.username,
    p.display_name,
    p.avatar_path,
    p.updated_at,
    case
      when f.status = 'accepted' then 'friend'
      when f.addressee_id = auth.uid() then 'incoming'
      else 'outgoing'
    end,
    coalesce(f.responded_at, f.created_at)
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where auth.uid() in (f.requester_id, f.addressee_id)
  order by lower(p.username);
$$;

create or replace function public.get_my_blocked_users()
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_path text,
  profile_updated_at timestamptz,
  blocked_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_path, p.updated_at, ub.created_at
  from public.user_blocks ub
  join public.profiles p on p.id = ub.blocked_id
  where ub.blocker_id = auth.uid()
  order by ub.created_at desc;
$$;

-- Used by public profile pages to decide which button to show.
-- relationship: 'self', 'none', 'friend', 'incoming', 'outgoing' or 'blocked'
-- ('blocked' means YOU blocked them; being blocked by them reads as 'none').
create or replace function public.get_relationship(other_username text)
returns table (user_id uuid, relationship text)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select p.id
    from public.profiles p
    where p.username is not null
      and lower(p.username) = lower(btrim(other_username))
    limit 1
  )
  select
    t.id,
    case
      when auth.uid() is null then 'none'
      when t.id = auth.uid() then 'self'
      when exists (select 1 from public.user_blocks ub where ub.blocker_id = auth.uid() and ub.blocked_id = t.id) then 'blocked'
      when f.status = 'accepted' then 'friend'
      when f.addressee_id = auth.uid() then 'incoming'
      when f.requester_id = auth.uid() then 'outgoing'
      else 'none'
    end
  from target t
  left join public.friendships f
    on least(f.requester_id, f.addressee_id) = least(auth.uid(), t.id)
   and greatest(f.requester_id, f.addressee_id) = greatest(auth.uid(), t.id);
$$;

-- -------------------------------------------------------------
-- 8. Reports
-- -------------------------------------------------------------
-- v1.6 supports reporting users. v1.7 (chat) and v1.9 (forums) replace this
-- function to add their own target types.
create or replace function public.submit_report(
  report_target_type text,
  report_target_id uuid,
  report_reason text,
  report_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  offender uuid;
  offender_name text;
  snapshot text;
  new_id uuid;
begin
  if me is null then
    raise exception 'You must be signed in to report something.';
  end if;

  if (select count(*) from public.reports r where r.reporter_id = me and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'You have sent a lot of reports today. Try again tomorrow.';
  end if;

  if report_target_type = 'user' then
    select p.id, p.username into offender, offender_name
    from public.profiles p where p.id = report_target_id;
    snapshot := null;
  else
    raise exception 'That kind of report is not supported yet.';
  end if;

  if offender is null then
    raise exception 'That collector no longer exists.';
  end if;

  if offender = me then
    raise exception 'You cannot report yourself.';
  end if;

  insert into public.reports (
    reporter_id, target_type, target_id, target_user_id, target_username,
    content_snapshot, reason, details
  )
  values (
    me, report_target_type, report_target_id, offender, offender_name,
    snapshot, report_reason, nullif(btrim(report_details), '')
  )
  returning id into new_id;

  return new_id;
exception
  when unique_violation then
    select r.id into new_id
    from public.reports r
    where r.reporter_id = me
      and r.target_type = report_target_type
      and r.target_id = report_target_id
      and r.status = 'open';
    return new_id;
end;
$$;

-- Admin queue. Raises for non-admins rather than returning an empty list, so a
-- broken role check is loud instead of silent.
create or replace function public.get_reports(status_filter text default 'open')
returns table (
  id uuid,
  target_type text,
  target_id uuid,
  target_user_id uuid,
  target_username text,
  content_snapshot text,
  reason text,
  details text,
  status text,
  admin_note text,
  created_at timestamptz,
  resolved_at timestamptz,
  reporter_username text,
  resolved_by_username text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can view reports.';
  end if;

  return query
  select
    r.id, r.target_type, r.target_id, r.target_user_id,
    coalesce(tp.username, r.target_username),
    r.content_snapshot, r.reason, r.details, r.status, r.admin_note,
    r.created_at, r.resolved_at,
    rp.username, ap.username
  from public.reports r
  left join public.profiles tp on tp.id = r.target_user_id
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles ap on ap.id = r.resolved_by
  where status_filter = 'all' or r.status = status_filter
  order by r.created_at desc
  limit 200;
end;
$$;

create or replace function public.resolve_report(report_id uuid, new_status text, note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can resolve reports.';
  end if;

  if new_status not in ('open', 'actioned', 'dismissed') then
    raise exception 'Unknown report status.';
  end if;

  update public.reports
  set
    status = new_status,
    admin_note = nullif(btrim(note), ''),
    resolved_at = case when new_status = 'open' then null else now() end,
    resolved_by = case when new_status = 'open' then null else auth.uid() end
  where id = report_id;

  if not found then
    raise exception 'That report no longer exists.';
  end if;
end;
$$;

-- -------------------------------------------------------------
-- 9. Function permissions
-- -------------------------------------------------------------
revoke all on function public.send_friend_request(text) from public, anon;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.get_my_friends() from public, anon;
revoke all on function public.get_my_blocked_users() from public, anon;
revoke all on function public.submit_report(text, uuid, text, text) from public, anon;
revoke all on function public.get_reports(text) from public, anon;
revoke all on function public.resolve_report(uuid, text, text) from public, anon;

grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.get_my_friends() to authenticated;
grant execute on function public.get_my_blocked_users() to authenticated;
grant execute on function public.submit_report(text, uuid, text, text) to authenticated;
grant execute on function public.get_reports(text) to authenticated;
grant execute on function public.resolve_report(uuid, text, text) to authenticated;

-- Profile pages are public, so anon can ask; it simply always gets 'none'.
revoke all on function public.get_relationship(text) from public;
grant execute on function public.get_relationship(text) to anon, authenticated;

-- Tell Supabase's API to pick up the new functions straight away.
notify pgrst, 'reload schema';
