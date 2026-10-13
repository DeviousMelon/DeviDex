-- =============================================================
-- DeviDex v1.7 - Social phase 2: 1-to-1 and group chat
--
-- Run AFTER v1.6. Safe to rerun during development.
--
-- Rules
-- - You can only start a chat with, or add to a group, people who are your
--   friends. In a 1-to-1 chat, unfriending or blocking stops new messages
--   (history stays visible to both).
-- - Only members can read a conversation. Admins cannot read chats; a report
--   captures a snapshot of the reported message instead.
-- - All writes go through functions. The browser only ever SELECTs, which is
--   also what Supabase Realtime uses to decide who receives a new message.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Tables
-- -------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group')),
  title text check (title is null or char_length(title) between 1 and 60),
  -- '<smaller uuid>:<larger uuid>' so each pair of friends has one 1-to-1 chat.
  direct_key text unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint conversations_kind_shape check (
    (kind = 'direct' and direct_key is not null and title is null)
    or (kind = 'group' and direct_key is null and title is not null)
  )
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx on public.conversation_members (user_id);

-- kind = 'system' rows are things like "Devi added Ash" and have no sender.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  kind text not null default 'text' check (kind in ('text', 'system')),
  body text not null check (char_length(body) <= 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at desc);
create index if not exists messages_sender_created_idx on public.messages (sender_id, created_at desc);

-- -------------------------------------------------------------
-- 2. Membership check used by every policy
-- -------------------------------------------------------------
-- SECURITY DEFINER so the membership policy does not recurse into itself. It
-- only ever answers "am I in this conversation?", so it is safe to expose.
create or replace function public.is_conversation_member(conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = conversation and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_conversation_member(uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid) to authenticated;

-- -------------------------------------------------------------
-- 3. Row Level Security: members read, nobody writes directly
-- -------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

revoke all on public.conversations from anon, authenticated;
revoke all on public.conversation_members from anon, authenticated;
revoke all on public.messages from anon, authenticated;
grant select on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;
grant select on public.messages to authenticated;

drop policy if exists "Members can read conversations" on public.conversations;
create policy "Members can read conversations"
on public.conversations for select to authenticated
using (public.is_conversation_member(id));

drop policy if exists "Members can read conversation members" on public.conversation_members;
create policy "Members can read conversation members"
on public.conversation_members for select to authenticated
using (public.is_conversation_member(conversation_id));

drop policy if exists "Members can read messages" on public.messages;
create policy "Members can read messages"
on public.messages for select to authenticated
using (public.is_conversation_member(conversation_id));

-- Live delivery. Realtime checks the SELECT policies above per subscriber.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['messages', 'conversation_members'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- -------------------------------------------------------------
-- 4. Internal helpers
-- -------------------------------------------------------------
create or replace function public.chat_add_system_message(conversation uuid, message_text text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.messages (conversation_id, sender_id, kind, body)
  values (conversation, null, 'system', left(message_text, 2000));
  update public.conversations set last_message_at = now() where id = conversation;
$$;

-- Resolves usernames to friend ids, failing loudly on anyone who is not an
-- accepted, unblocked friend of `me`.
create or replace function public.chat_resolve_friends(me uuid, usernames text[])
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  wanted text;
  found_id uuid;
  result uuid[] := '{}';
begin
  foreach wanted in array coalesce(usernames, '{}') loop
    wanted := lower(btrim(replace(wanted, '@', '')));
    continue when wanted = '';

    select p.id into found_id
    from public.profiles p
    where p.username is not null and lower(p.username) = wanted;

    if found_id is null or found_id = me
       or not public.are_friends(me, found_id)
       or public.is_blocked_between(me, found_id) then
      raise exception 'You can only add friends to a chat (@% is not on your friends list).', wanted;
    end if;

    if not found_id = any(result) then
      result := result || found_id;
    end if;
  end loop;

  return result;
end;
$$;

create or replace function public.chat_username(person uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce('@' || p.username, 'Someone') from public.profiles p where p.id = person;
$$;

revoke all on function public.chat_add_system_message(uuid, text) from public, anon, authenticated;
revoke all on function public.chat_resolve_friends(uuid, text[]) from public, anon, authenticated;
revoke all on function public.chat_username(uuid) from public, anon, authenticated;

-- -------------------------------------------------------------
-- 5. Starting chats
-- -------------------------------------------------------------
create or replace function public.start_direct_conversation(other_username text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.social_current_user();
  other uuid := (public.chat_resolve_friends(me, array[other_username]))[1];
  key text;
  conversation uuid;
begin
  if other is null then
    raise exception 'Choose a friend to message.';
  end if;

  key := least(me, other)::text || ':' || greatest(me, other)::text;

  insert into public.conversations (kind, direct_key, created_by)
  values ('direct', key, me)
  on conflict (direct_key) do nothing;

  select c.id into conversation from public.conversations c where c.direct_key = key;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (conversation, me, 'member'), (conversation, other, 'member')
  on conflict do nothing;

  return conversation;
end;
$$;

create or replace function public.create_group_conversation(group_title text, member_usernames text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.social_current_user();
  members uuid[] := public.chat_resolve_friends(me, member_usernames);
  clean_title text := btrim(coalesce(group_title, ''));
  conversation uuid;
begin
  if clean_title = '' then
    raise exception 'Give the group a name.';
  end if;
  if char_length(clean_title) > 60 then
    raise exception 'Group names can be up to 60 characters.';
  end if;
  if coalesce(array_length(members, 1), 0) < 1 then
    raise exception 'Add at least one friend to the group.';
  end if;
  if array_length(members, 1) > 49 then
    raise exception 'Groups can have up to 50 people.';
  end if;
  if (select count(*) from public.conversations c where c.created_by = me and c.kind = 'group' and c.created_at > now() - interval '1 day') >= 10 then
    raise exception 'You have made a lot of groups today. Try again tomorrow.';
  end if;

  insert into public.conversations (kind, title, created_by)
  values ('group', clean_title, me)
  returning id into conversation;

  insert into public.conversation_members (conversation_id, user_id, role)
  select conversation, me, 'owner'
  union all
  select conversation, unnest(members), 'member';

  perform public.chat_add_system_message(conversation, public.chat_username(me) || ' created the group');
  return conversation;
end;
$$;

-- -------------------------------------------------------------
-- 6. Managing groups
-- -------------------------------------------------------------
-- Any member can add their own friends. Only the owner can rename or remove.
create or replace function public.add_group_members(conversation uuid, member_usernames text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.social_current_user();
  members uuid[] := public.chat_resolve_friends(me, member_usernames);
  added uuid;
begin
  if not exists (
    select 1 from public.conversations c
    join public.conversation_members m on m.conversation_id = c.id and m.user_id = me
    where c.id = conversation and c.kind = 'group'
  ) then
    raise exception 'That group does not exist or you are not in it.';
  end if;

  if (select count(*) from public.conversation_members m where m.conversation_id = conversation)
     + coalesce(array_length(members, 1), 0) > 50 then
    raise exception 'Groups can have up to 50 people.';
  end if;

  foreach added in array members loop
    insert into public.conversation_members (conversation_id, user_id)
    values (conversation, added)
    on conflict do nothing;

    if found then
      perform public.chat_add_system_message(
        conversation,
        public.chat_username(me) || ' added ' || public.chat_username(added)
      );
    end if;
  end loop;
end;
$$;

create or replace function public.remove_group_member(conversation uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.social_current_user();
begin
  if not exists (
    select 1 from public.conversation_members m
    join public.conversations c on c.id = m.conversation_id
    where m.conversation_id = conversation and m.user_id = me and m.role = 'owner' and c.kind = 'group'
  ) then
    raise exception 'Only the group owner can remove people.';
  end if;

  if member = me then
    raise exception 'Use "Leave group" to leave your own group.';
  end if;

  delete from public.conversation_members m
  where m.conversation_id = conversation and m.user_id = member;

  if found then
    perform public.chat_add_system_message(
      conversation,
      public.chat_username(me) || ' removed ' || public.chat_username(member)
    );
  end if;
end;
$$;

create or replace function public.rename_group(conversation uuid, new_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.social_current_user();
  clean_title text := btrim(coalesce(new_title, ''));
begin
  if clean_title = '' or char_length(clean_title) > 60 then
    raise exception 'Group names need 1–60 characters.';
  end if;

  update public.conversations c
  set title = clean_title
  where c.id = conversation
    and c.kind = 'group'
    and exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id and m.user_id = me and m.role = 'owner'
    );

  if not found then
    raise exception 'Only the group owner can rename it.';
  end if;

  perform public.chat_add_system_message(
    conversation,
    public.chat_username(me) || ' renamed the group to "' || clean_title || '"'
  );
end;
$$;

-- Leaving hands ownership to the longest-standing member. The last person out
-- deletes the group and its messages.
create or replace function public.leave_group(conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  my_role text;
begin
  if me is null then
    raise exception 'You must be signed in to do that.';
  end if;

  delete from public.conversation_members m
  using public.conversations c
  where c.id = m.conversation_id
    and m.conversation_id = conversation
    and m.user_id = me
    and c.kind = 'group'
  returning m.role into my_role;

  if my_role is null then
    raise exception 'That group does not exist or you are not in it.';
  end if;

  if not exists (select 1 from public.conversation_members m where m.conversation_id = conversation) then
    delete from public.conversations where id = conversation;
    return;
  end if;

  if my_role = 'owner' then
    update public.conversation_members
    set role = 'owner'
    where conversation_id = conversation
      and user_id = (
        select m.user_id from public.conversation_members m
        where m.conversation_id = conversation
        order by m.joined_at, m.user_id
        limit 1
      );
  end if;

  perform public.chat_add_system_message(conversation, public.chat_username(me) || ' left the group');
end;
$$;

-- -------------------------------------------------------------
-- 7. Messages
-- -------------------------------------------------------------
create or replace function public.send_message(conversation uuid, message_body text)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.social_current_user();
  conversation_kind text;
  other uuid;
  clean_body text := btrim(coalesce(message_body, ''));
  saved public.messages;
begin
  select c.kind into conversation_kind
  from public.conversations c
  join public.conversation_members m on m.conversation_id = c.id and m.user_id = me
  where c.id = conversation;

  if conversation_kind is null then
    raise exception 'That chat does not exist or you are not in it.';
  end if;

  if clean_body = '' then
    raise exception 'Type a message first.';
  end if;
  if char_length(clean_body) > 2000 then
    raise exception 'Messages can be up to 2,000 characters.';
  end if;

  if (select count(*) from public.messages msg where msg.sender_id = me and msg.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Slow down a little. You can send 20 messages a minute.';
  end if;

  if conversation_kind = 'direct' then
    select m.user_id into other
    from public.conversation_members m
    where m.conversation_id = conversation and m.user_id <> me;

    if other is null or not public.are_friends(me, other) or public.is_blocked_between(me, other) then
      raise exception 'You can only message friends. Add them again to keep chatting.';
    end if;
  end if;

  insert into public.messages (conversation_id, sender_id, body)
  values (conversation, me, clean_body)
  returning * into saved;

  update public.conversations set last_message_at = saved.created_at where id = conversation;
  update public.conversation_members
  set last_read_at = saved.created_at
  where conversation_id = conversation and user_id = me;

  return saved;
end;
$$;

-- Deleting keeps a placeholder so replies still make sense.
create or replace function public.delete_message(message uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.messages
  set body = '', deleted_at = now()
  where id = message and sender_id = auth.uid() and kind = 'text' and deleted_at is null;

  if not found then
    raise exception 'You can only delete your own messages.';
  end if;
end;
$$;

create or replace function public.mark_conversation_read(conversation uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversation_members
  set last_read_at = now()
  where conversation_id = conversation and user_id = auth.uid();
$$;

-- -------------------------------------------------------------
-- 8. Reading chats
-- -------------------------------------------------------------
-- Messages from people you have blocked never count as unread or show in previews.
create or replace function public.get_my_conversations()
returns table (
  conversation_id uuid,
  kind text,
  title text,
  member_count bigint,
  my_role text,
  other_user_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_path text,
  other_profile_updated_at timestamptz,
  can_message boolean,
  last_message_at timestamptz,
  last_message_body text,
  last_message_kind text,
  last_message_deleted boolean,
  last_message_sender_username text,
  unread_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.kind,
    c.title,
    (select count(*) from public.conversation_members x where x.conversation_id = c.id),
    mine.role,
    other.id,
    other.username,
    other.display_name,
    other.avatar_path,
    other.updated_at,
    case
      when c.kind = 'group' then true
      else other.id is not null
        and public.are_friends(auth.uid(), other.id)
        and not public.is_blocked_between(auth.uid(), other.id)
    end,
    c.last_message_at,
    left(last_msg.body, 160),
    last_msg.kind,
    last_msg.deleted_at is not null,
    sender.username,
    (
      select count(*) from public.messages u
      where u.conversation_id = c.id
        and u.created_at > mine.last_read_at
        and u.sender_id is distinct from auth.uid()
        and u.deleted_at is null
        and not exists (select 1 from public.user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = u.sender_id)
    )
  from public.conversation_members mine
  join public.conversations c on c.id = mine.conversation_id
  left join lateral (
    select p.* from public.conversation_members om
    join public.profiles p on p.id = om.user_id
    where c.kind = 'direct' and om.conversation_id = c.id and om.user_id <> auth.uid()
    limit 1
  ) other on true
  left join lateral (
    select msg.* from public.messages msg
    where msg.conversation_id = c.id
      and not exists (select 1 from public.user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = msg.sender_id)
    order by msg.created_at desc
    limit 1
  ) last_msg on true
  left join public.profiles sender on sender.id = last_msg.sender_id
  where mine.user_id = auth.uid()
  order by c.last_message_at desc;
$$;

create or replace function public.get_unread_conversation_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from public.conversation_members mine
  where mine.user_id = auth.uid()
    and exists (
      select 1 from public.messages u
      where u.conversation_id = mine.conversation_id
        and u.created_at > mine.last_read_at
        and u.sender_id is distinct from auth.uid()
        and u.deleted_at is null
        and not exists (select 1 from public.user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = u.sender_id)
    );
$$;

-- Profiles are not directly readable, so chats get their members' public
-- details from here. Returns nothing if you are not in the conversation.
create or replace function public.get_conversation_members(conversation uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_path text,
  profile_updated_at timestamptz,
  role text,
  joined_at timestamptz,
  is_friend boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id, p.username, p.display_name, p.avatar_path, p.updated_at,
    m.role, m.joined_at,
    p.id = auth.uid() or public.are_friends(auth.uid(), p.id)
  from public.conversation_members m
  join public.profiles p on p.id = m.user_id
  where m.conversation_id = conversation
    and public.is_conversation_member(conversation)
  order by m.role = 'owner' desc, lower(p.username);
$$;

-- -------------------------------------------------------------
-- 9. Reports now cover chat messages
-- -------------------------------------------------------------
-- Same as v1.6, plus 'message'. You can only report a message you can see, and
-- the database copies its text into the report as evidence.
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
  elsif report_target_type = 'message' then
    select msg.sender_id, p.username, msg.body into offender, offender_name, snapshot
    from public.messages msg
    left join public.profiles p on p.id = msg.sender_id
    join public.conversation_members m on m.conversation_id = msg.conversation_id and m.user_id = me
    where msg.id = report_target_id and msg.kind = 'text' and msg.deleted_at is null;
  else
    raise exception 'That kind of report is not supported yet.';
  end if;

  if offender is null then
    raise exception 'That no longer exists, or you cannot see it.';
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

-- -------------------------------------------------------------
-- 10. Function permissions
-- -------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.start_direct_conversation(text)',
    'public.create_group_conversation(text, text[])',
    'public.add_group_members(uuid, text[])',
    'public.remove_group_member(uuid, uuid)',
    'public.rename_group(uuid, text)',
    'public.leave_group(uuid)',
    'public.send_message(uuid, text)',
    'public.delete_message(uuid)',
    'public.mark_conversation_read(uuid)',
    'public.get_my_conversations()',
    'public.get_unread_conversation_count()',
    'public.get_conversation_members(uuid)',
    'public.submit_report(text, uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
