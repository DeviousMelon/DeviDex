-- =============================================================
-- DeviDex v2.2 - drop unused database objects
-- Safe to rerun. Run after v2.1.1, then run checks/021_drop_unused_objects.sql.
--
-- game_dex_entries (v0.3/v0.4): the original per-game Dex membership table.
--   Replaced by game_dex_set_entries in v1.1 (shared Game Dexes). Before this
--   drop (16 Oct 2026) it held 13,136 rows / 2.4 MB, nothing in the app,
--   any database function, view or foreign key referenced it, and query
--   stats since 7 Oct showed no reads or writes from the app.
--
-- form_category_counts (v0.9): a view counting forms per category. Only
--   checks/010_forms.sql ever read it.
--
-- Plain DROP (no CASCADE) on purpose: if anything has started depending on
-- either object since, this fails and changes nothing, instead of quietly
-- dropping the dependent too. Policies and indexes on the table go with it.
--
-- NOTE: re-running v0.3, v0.4 or v0.9 recreates these. If you ever do, run
-- this file again afterwards.
-- =============================================================

drop view if exists public.form_category_counts;
drop table if exists public.game_dex_entries;
