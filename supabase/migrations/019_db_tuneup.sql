-- =============================================================
-- DeviDex v2.1 - database tune-up
-- Already applied to the live project on 2026-10-15 as migration
-- 20261015111612_db_tuneup_rls_indexes_cleanup. Kept here so the repo
-- can rebuild the database. Safe to rerun (the only change from what ran
-- live is `if exists` on the profiles policy drop, so a rerun doesn't fail).
--
-- 1. RLS policies call auth.uid() once per query instead of once per row.
-- 2. Admin "FOR ALL" policies split into insert/update/delete, so reads of
--    reference data no longer check two overlapping policies.
-- 3. Indexes: drop a redundant one, add two for trade matching and
--    threaded forum replies.
-- 4. Remove "owns nothing" progress rows (unticking now deletes the row).
--
-- Run after v1.9. Then run checks/019_db_tuneup.sql.
-- =============================================================

do $$
declare r record;
begin
  for r in
    select tablename, policyname, cmd
    from pg_policies
    where schemaname = 'public'
      and (qual = '(auth.uid() = user_id)' or with_check = '(auth.uid() = user_id)')
  loop
    if r.cmd = 'INSERT' then
      execute format('alter policy %I on public.%I with check ((select auth.uid()) = user_id)', r.policyname, r.tablename);
    elsif r.cmd = 'UPDATE' then
      execute format('alter policy %I on public.%I using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', r.policyname, r.tablename);
    else
      execute format('alter policy %I on public.%I using ((select auth.uid()) = user_id)', r.policyname, r.tablename);
    end if;
  end loop;
end $$;

alter policy "Users can read own friendships" on public.friendships
  using ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id);

alter policy "Users can read own blocks" on public.user_blocks
  using ((select auth.uid()) = blocker_id);

alter policy "Users can read own profile" on public.profiles
  using ((select auth.uid()) = id or (select public.is_admin()));

drop policy if exists "Admins can update profiles" on public.profiles;
alter policy "Users can update own profile" on public.profiles
  using ((select auth.uid()) = id or (select public.is_admin()))
  with check ((select auth.uid()) = id or (select public.is_admin()));

do $$
declare r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public' and cmd = 'ALL' and qual = 'is_admin()'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))',
                   r.policyname || ' (insert)', r.tablename);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
                   r.policyname || ' (update)', r.tablename);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))',
                   r.policyname || ' (delete)', r.tablename);
  end loop;
end $$;

drop index if exists public.collection_progress_user_idx;
create index if not exists trade_list_form_shiny_idx on public.trade_list (form_id, shiny);
create index if not exists forum_comments_parent_idx on public.forum_comments (parent_id);

delete from public.collection_progress
  where not normal_owned and not shiny_owned and notes is null;
delete from public.game_collection_progress
  where not normal_owned and not shiny_owned and notes is null;
delete from public.game_form_collection_progress
  where not normal_owned and not shiny_owned and notes is null;
