# DeviDex Supabase setup

The project URL and publishable browser key are already wired into the local
`.env.local`. The remaining steps must be done inside your Supabase account because
a public browser key deliberately cannot perform privileged database setup.

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

1. `migrations/014_social_friends.sql`: friend requests, blocking, reports
2. `migrations/015_social_chat.sql`: 1-to-1 and group chat (live via Realtime)
3. `migrations/016_social_collaboration.sql`: Pokémon cards in chat, compare collections, trade lists
4. `migrations/017_forums.sql`: forum categories, posts, threaded comments, votes

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

## v2.1: database tune-up and function permissions

Both are **already applied** to the live project (15 Oct 2026). They're here so
the repo can rebuild the database from scratch. Run after v1.9, in order:

1. `migrations/019_db_tuneup.sql`: faster RLS checks, split admin policies, index tidy-up,
   removes "owns nothing" progress rows (unticking both boxes now deletes the row)
2. `migrations/020_function_permissions.sql`: signed-out visitors can no longer call
   signed-in-only functions; drops the unused `export_own_collection_v2/v3`

Then run `checks/019_db_tuneup.sql`. Every row should say `ok = true`.

Notes:

- v1.3 to v1.5.1 had no schema changes, which is why only their `verify-` files exist.
- `checks/009_data_safety.sql` and `checks/011_collection_presets.sql` will now show the v2/v3 export
  functions as missing. That's expected.
- From now on, commit any SQL you run in the dashboard here as a numbered file,
  so the repo and the live database don't drift apart again.
