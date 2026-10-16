# DeviDex Supabase setup

The project URL and publishable browser key are already wired into the local
`.env.local`. The remaining steps must be done inside your Supabase account because
a public browser key deliberately cannot perform privileged database setup.

## Folder layout

- `migrations/NNN_name.sql`: schema changes. Run them **in number order** in the
  SQL Editor. Every one is safe to rerun.
- `checks/NNN_name.sql`: read-only check for the migration with the same number.
  Run it after the migration; every row should say `ok = true`.
- `checks/catalogue.sql`: read-only sanity check of the Pokémon catalogue tables.
- `promote-admin.sql`: one-time owner action, not a migration (see below).

Migration numbers are just run order. They are not app versions: the app version
lives in `package.json` and on the git tags.

## Migrations

| # | File | What it does | Old name |
|---|---|---|---|
| 001 | `001_schema.sql` | Profiles, roles, RLS foundation | schema |
| 002 | `002_core_living_dex.sql` | Living Dex catalogue and progress | v0.3 |
| 003 | `003_game_dexes_and_click_cycle.sql` | Game Dexes, click-cycle tiles | v0.4 |
| 004 | `004_public_accounts.sql` | Public accounts, guest mode | v0.5 |
| 005 | `005_account_safety_and_backups.sql` | Account safety, backups | v0.6 |
| 006 | `006_account_completion.sql` | Phase 2 account completion | v0.7 |
| 007 | `007_profile_save_hotfix.sql` | Profile save hotfix | v0.7.1 |
| 008 | `008_account_stability_rollback.sql` | Account stability rollback | v0.7.2 |
| 009 | `009_data_safety.sql` | Phase 3 data safety | v0.8 |
| 010 | `010_forms.sql` | Phase 4 forms and form rules | v0.9 |
| 011 | `011_collection_presets.sql` | Phase 5 collection presets | v1.0 |
| 012 | `012_shared_game_dexes.sql` | Phase 6A shared Game Dexes | v1.1 |
| 013 | `013_game_forms.sql` | Phase 6B forms in Game Dexes | v1.2 |
| 014 | `014_social_friends.sql` | Friend requests, blocking, reports | v1.6 |
| 015 | `015_social_chat.sql` | 1-to-1 and group chat | v1.7 |
| 016 | `016_social_collaboration.sql` | Pokémon in chat, compare, trade lists | v1.8 |
| 017 | `017_forums.sql` | Forums | v1.9 |
| 018 | `018_bank_shutdown.sql` | Pokémon Bank shutdown prep | v2.0 |
| 019 | `019_db_tuneup.sql` | RLS speed-ups, policy split, index tidy-up | v2.1 |
| 020 | `020_function_permissions.sql` | Signed-in-only functions locked down | v2.1.1 |
| 021 | `021_drop_unused_objects.sql` | Drops two unused objects | v2.2 |

"Old name" is the label the file had before the renumbering. Older code comments
(for example "v0.9 compatibility mirror" or "the v1.8 column") use those labels.
The releases built locally as v1.3, v1.4, v1.5 and v1.5.1 changed no schema, so
they have no migration; `checks/catalogue.sql` covers what they relied on.

**Live database status:** 001 to 020 are applied. 021 has not been run yet.

## First-time setup

1. Open **Supabase -> DeviDex -> SQL Editor**.
2. Run `migrations/001_schema.sql`.
3. In **Authentication -> URL Configuration**, set Site URL to `http://localhost:5173` and add `http://localhost:5173/**` to Redirect URLs.
4. Run DeviDex locally with `npm run dev`.
5. Open `/login` and create the account `devidex314@gmail.com`.
6. Confirm the account by email if confirmation is enabled.
7. Return to SQL Editor and run `promote-admin.sql`.
8. Refresh/sign back into DeviDex. You should now see **Admin** in the header.
9. If anything looks suspicious, run `checks/001_schema.sql`.
10. Run the rest of `migrations/` in number order, each followed by its check.

## Why promotion happens in SQL

The website must never be able to promote itself to admin. If frontend JavaScript
could do that, every bored visitor could do it too. `promote-admin.sql` is a
server-side, one-time owner action.

## Never expose the service-role key

The Vite browser app should use only the Supabase **publishable/anon** key. A
service-role key bypasses Row Level Security and must never be placed in frontend
source code, GitHub, or client-side Cloudflare environment variables.

## 014 to 017: friends, chat, trading and forums

Run these **in order**, **before** deploying the matching frontend (the Account
page reads a column 016 adds):

1. `migrations/014_social_friends.sql`: friend requests, blocking, reports
2. `migrations/015_social_chat.sql`: 1-to-1 and group chat (live via Realtime)
3. `migrations/016_social_collaboration.sql`: Pokémon cards in chat, compare collections, trade lists
4. `migrations/017_forums.sql`: forum categories, posts, threaded comments, votes

After each one, run its check in `checks/`.

Notes:

- Chat updates live through Supabase Realtime. The migrations add the tables to
  the `supabase_realtime` publication themselves; nothing to toggle in the dashboard.
- Admins cannot read private chats. Reports carry a snapshot of the reported
  message, post or comment instead, and show up on the Admin page.
- Friends can see each other's collections by default (Account → "Friends can
  see my collection"). The public collection summary is a separate switch.
- Starter forum categories are created by 017. Edit names and descriptions in
  the `forum_categories` table; Announcements only accepts admin posts.

## 018: Pokémon Bank shutdown prep

Run `migrations/018_bank_shutdown.sql` **before** deploying the matching frontend,
then `checks/018_bank_shutdown.sql`.

- `bank_checklist` and `ribbon_plans` are private per user (RLS) and are
  removed by `delete_own_account()` through the profile cascade.
- `bank_last_chance` is public to read and admin-only to edit, from the Admin
  page. Rerunning the migration refreshes the nine starter entries' wording
  but never re-publishes one you've hidden.
- The ribbon list is in `src/lib/bankRibbons.ts`, not the database. Plans only
  store ribbon ids, so never rename an id once people are using it.
- The deadline lives in one place: `BANK_DEADLINE` in `src/lib/bank.ts`.
  The nav link disappears after it; `/bank` stays up as a record.

## 019 and 020: database tune-up and function permissions

Both were applied to the live project on 15 Oct 2026. They're here so the repo
can rebuild the database from scratch. Run after 018, in order:

1. `migrations/019_db_tuneup.sql`: faster RLS checks, split admin policies, index tidy-up,
   removes "owns nothing" progress rows (unticking both boxes now deletes the row)
2. `migrations/020_function_permissions.sql`: signed-out visitors can no longer call
   signed-in-only functions; drops the unused `export_own_collection_v2/v3`

Then run `checks/019_db_tuneup.sql`, which covers both.

Notes:

- `checks/009_data_safety.sql` and `checks/011_collection_presets.sql` will now show
  the v2/v3 export functions as missing. That's expected.
- Commit any SQL you run in the dashboard here as the next numbered file, so the
  repo and the live database don't drift apart again.

## 021: drop unused database objects

`migrations/021_drop_unused_objects.sql` drops two things nothing uses:

- `game_dex_entries`, the old per-game Dex table, replaced by
  `game_dex_set_entries` in 012 (it was the biggest table, at 2.4 MB)
- the `form_category_counts` view from 010

Then run `checks/021_drop_unused_objects.sql`. Re-running 002, 003 or 010 recreates
both, so run 021 again after any of those. `checks/003_game_dexes_and_click_cycle.sql`
and `checks/010_forms.sql` will now error on the dropped objects; that's expected.
