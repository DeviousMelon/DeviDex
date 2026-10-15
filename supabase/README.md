# DeviDex Supabase setup

The project URL and publishable browser key are already wired into the local
`.env.local`. The remaining steps must be done inside your Supabase account because
a public browser key deliberately cannot perform privileged database setup.

## First-time setup

1. Open **Supabase -> DeviDex -> SQL Editor**.
2. Run `schema.sql`.
3. In **Authentication -> URL Configuration**, set Site URL to `http://localhost:5173` and add `http://localhost:5173/**` to Redirect URLs.
4. Run DeviDex locally with `npm run dev`.
5. Open `/login` and create the account `devidex314@gmail.com`.
6. Confirm the account by email if confirmation is enabled.
7. Return to SQL Editor and run `promote-admin.sql`.
8. Refresh/sign back into DeviDex. You should now see **Admin** in the header.
9. If anything looks suspicious, run `verify-setup.sql`.

## Why promotion happens in SQL

The website must never be able to promote itself to admin. If frontend JavaScript
could do that, every bored visitor could do it too. `promote-admin.sql` is a
server-side, one-time owner action.

## Never expose the service-role key

The Vite browser app should use only the Supabase **publishable/anon** key. A
service-role key bypasses Row Level Security and must never be placed in frontend
source code, GitHub, or client-side Cloudflare environment variables.

## v1.6–v1.9: friends, chat, trading and forums

Run these **in order** in the SQL Editor, **before** deploying the matching
frontend (the new Account page reads a column v1.8 adds):

1. `v1.6-social-friends.sql`: friend requests, blocking, reports
2. `v1.7-social-chat.sql`: 1-to-1 and group chat (live via Realtime)
3. `v1.8-social-collaboration.sql`: Pokémon cards in chat, compare collections, trade lists
4. `v1.9-forums.sql`: forum categories, posts, threaded comments, votes

After each one, run its `verify-v1.x.sql`. Every row should say `ok = true`.
All four are safe to rerun.

Notes:

- Chat updates live through Supabase Realtime. The migrations add the tables to
  the `supabase_realtime` publication themselves; nothing to toggle in the dashboard.
- Admins cannot read private chats. Reports carry a snapshot of the reported
  message, post or comment instead, and show up on the Admin page.
- Friends can see each other's collections by default (Account → "Friends can
  see my collection"). The public collection summary is a separate switch.
- Starter forum categories are created by v1.9. Edit names and descriptions in
  the `forum_categories` table; Announcements only accepts admin posts.

## v2.0: Pokémon Bank shutdown prep

Run `v2.0-bank-shutdown.sql` in the SQL Editor **before** deploying the
matching frontend, then `verify-v2.0.sql`. Every row should say `ok = true`.
Safe to rerun.

- `bank_checklist` and `ribbon_plans` are private per user (RLS) and are
  removed by `delete_own_account()` through the profile cascade.
- `bank_last_chance` is public to read and admin-only to edit, from the Admin
  page. Rerunning the migration refreshes the nine starter entries' wording
  but never re-publishes one you've hidden.
- The ribbon list is in `src/lib/bankRibbons.ts`, not the database. Plans only
  store ribbon ids, so never rename an id once people are using it.
- The deadline lives in one place: `BANK_DEADLINE` in `src/lib/bank.ts`.
  The nav link disappears after it; `/bank` stays up as a record.

## v2.1: database tune-up and function permissions

Both are **already applied** to the live project (15 Oct 2026). They're here so
the repo can rebuild the database from scratch. Run after v1.9, in order:

1. `v2.1-db-tuneup.sql`: faster RLS checks, split admin policies, index tidy-up,
   removes "owns nothing" progress rows (unticking both boxes now deletes the row)
2. `v2.1.1-function-permissions.sql`: signed-out visitors can no longer call
   signed-in-only functions; drops the unused `export_own_collection_v2/v3`

Then run `verify-v2.1.sql`. Every row should say `ok = true`.

Notes:

- v1.3 to v1.5.1 had no schema changes, which is why only their `verify-` files exist.
- `verify-v0.8.sql` and `verify-v1.0.sql` will now show the v2/v3 export
  functions as missing. That's expected.
- From now on, commit any SQL you run in the dashboard here as a numbered file,
  so the repo and the live database don't drift apart again.
