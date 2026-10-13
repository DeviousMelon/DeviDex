-- =============================================================
-- DeviDex v1.8 - Social phase 3: share Pokémon, compare, trade
--
-- Run AFTER v1.7. Safe to rerun during development.
--
-- - Messages can carry one Pokémon card (a form, normal or shiny).
-- - New privacy switch: "Friends can see my collection" (on by default; the
--   existing public-summary switch is separate and stays off by default).
-- - A trade list of spares you can give away, per form and normal/shiny.
-- - compare_collection_with_friend() returns both collections side by side,
--   only for accepted friends who allow it.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Pokémon cards in chat
-- -------------------------------------------------------------
alter table public.messages
  add column if not exists pokemon_form_id bigint references public.pokemon_forms(id) on delete set null,
  add column if not exists pokemon_shiny boolean not null default false;

-- Replace v1.7's two-argument version so there is only one send_message().
drop function if exists public.send_message(uuid, text);

create or replace function public.send_message(
  conversation uuid,
  message_body text default '',
  shared_form_id bigint default null,
  shared_shiny boolean default false
)
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

  if clean_body = '' and shared_form_id is null then
    raise exception 'Type a message first.';
  end if;
  if char_length(clean_body) > 2000 then
    raise exception 'Messages can be up to 2,000 characters.';
  end if;
  if shared_form_id is not null and not exists (select 1 from public.pokemon_forms f where f.id = shared_form_id) then
    raise exception 'That Pokémon is not in the DeviDex catalogue.';
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

  insert into public.messages (conversation_id, sender_id, body, pokemon_form_id, pokemon_shiny)
  values (conversation, me, clean_body, shared_form_id, coalesce(shared_shiny, false) and shared_form_id is not null)
  returning * into saved;

  update public.conversations set last_message_at = saved.created_at where id = conversation;
  update public.conversation_members
  set last_read_at = saved.created_at
  where conversation_id = conversation and user_id = me;

  return saved;
end;
$$;

revoke all on function public.send_message(uuid, text, bigint, boolean) from public, anon;
grant execute on function public.send_message(uuid, text, bigint, boolean) to authenticated;

-- Deleting a message also drops its Pokémon card.
create or replace function public.delete_message(message uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.messages
  set body = '', pokemon_form_id = null, pokemon_shiny = false, deleted_at = now()
  where id = message and sender_id = auth.uid() and kind = 'text' and deleted_at is null;

  if not found then
    raise exception 'You can only delete your own messages.';
  end if;
end;
$$;

-- -------------------------------------------------------------
-- 2. "Friends can see my collection"
-- -------------------------------------------------------------
alter table public.profiles
  add column if not exists collection_friends_visible boolean not null default true;

-- Adds this one column to the list a signed-in user may update on their own
-- row (v0.7.2 granted the rest). role is still not updatable.
grant update (collection_friends_visible) on public.profiles to authenticated;

-- -------------------------------------------------------------
-- 3. Trade list (your spares)
-- -------------------------------------------------------------
create table if not exists public.trade_list (
  user_id uuid not null references public.profiles(id) on delete cascade,
  form_id bigint not null references public.pokemon_forms(id) on delete cascade,
  shiny boolean not null default false,
  note text check (note is null or char_length(note) <= 140),
  created_at timestamptz not null default now(),
  primary key (user_id, form_id, shiny)
);

alter table public.trade_list enable row level security;
revoke all on public.trade_list from anon, authenticated;
grant select, insert, update, delete on public.trade_list to authenticated;

drop policy if exists "Users can read own trade list" on public.trade_list;
create policy "Users can read own trade list"
on public.trade_list for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can add to own trade list" on public.trade_list;
create policy "Users can add to own trade list"
on public.trade_list for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own trade list" on public.trade_list;
create policy "Users can update own trade list"
on public.trade_list for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete from own trade list" on public.trade_list;
create policy "Users can delete from own trade list"
on public.trade_list for delete to authenticated
using (auth.uid() = user_id);

-- -------------------------------------------------------------
-- 4. Comparing with a friend
-- -------------------------------------------------------------
-- Header info for the compare page, and the reason if it is not allowed.
-- status: 'ok', 'not_friends' or 'private'.
create or replace function public.get_friend_compare_info(friend_username text)
returns table (
  status text,
  user_id uuid,
  username text,
  display_name text,
  avatar_path text,
  profile_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := public.social_current_user();
  friend public.profiles%rowtype;
begin
  select * into friend
  from public.profiles p
  where p.username is not null and lower(p.username) = lower(btrim(friend_username));

  if friend.id is null or not public.are_friends(me, friend.id) or public.is_blocked_between(me, friend.id) then
    return query select 'not_friends'::text, null::uuid, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  return query select
    case when friend.collection_friends_visible or friend.collection_public then 'ok' else 'private' end,
    friend.id, friend.username, friend.display_name, friend.avatar_path, friend.updated_at;
end;
$$;

-- One row per form either of you owns or lists for trade. Forms neither of you
-- has are left out; the browser fills those in from its catalogue.
create or replace function public.compare_collection_with_friend(friend_username text)
returns table (
  form_id bigint,
  my_normal boolean,
  my_shiny boolean,
  their_normal boolean,
  their_shiny boolean,
  i_offer_normal boolean,
  i_offer_shiny boolean,
  they_offer_normal boolean,
  they_offer_shiny boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := public.social_current_user();
  info record;
begin
  select * into info from public.get_friend_compare_info(friend_username);

  if info.status = 'not_friends' then
    raise exception 'You can only compare collections with friends.';
  elsif info.status = 'private' then
    raise exception '@% keeps their collection private.', info.username;
  end if;

  return query
  with ids as (
    select cp.form_id from public.collection_progress cp
    where cp.user_id in (me, info.user_id) and (cp.normal_owned or cp.shiny_owned)
    union
    select t.form_id from public.trade_list t where t.user_id in (me, info.user_id)
  )
  select
    ids.form_id,
    coalesce(mine.normal_owned, false),
    coalesce(mine.shiny_owned, false),
    coalesce(theirs.normal_owned, false),
    coalesce(theirs.shiny_owned, false),
    exists (select 1 from public.trade_list t where t.user_id = me and t.form_id = ids.form_id and not t.shiny),
    exists (select 1 from public.trade_list t where t.user_id = me and t.form_id = ids.form_id and t.shiny),
    exists (select 1 from public.trade_list t where t.user_id = info.user_id and t.form_id = ids.form_id and not t.shiny),
    exists (select 1 from public.trade_list t where t.user_id = info.user_id and t.form_id = ids.form_id and t.shiny)
  from ids
  left join public.collection_progress mine on mine.user_id = me and mine.form_id = ids.form_id
  left join public.collection_progress theirs on theirs.user_id = info.user_id and theirs.form_id = ids.form_id;
end;
$$;

revoke all on function public.get_friend_compare_info(text) from public, anon;
revoke all on function public.compare_collection_with_friend(text) from public, anon;
grant execute on function public.get_friend_compare_info(text) to authenticated;
grant execute on function public.compare_collection_with_friend(text) to authenticated;

-- -------------------------------------------------------------
-- 5. Backups include the trade list
-- -------------------------------------------------------------
-- Export/restore v4 (v1.2) predates trade lists. Rather than bump the backup
-- format, the trade list is small and easy to rebuild, so it is left out of
-- backups for now. Deleting an account removes it with everything else.
