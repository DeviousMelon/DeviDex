# Moving DeviDex to Cloudflare

Goal: run DeviDex on Cloudflare (Worker + D1 + static files), keeping only
logins on Supabase Auth for now.

## Where things are

| Piece | Status |
| --- | --- |
| Shared data (catalogue + reference tables) as static files | Done. Exported at build time into `/data`; the site reads it from there. |
| D1 schema for user data | Done. Applied to the `devidex` D1 database (Western Europe). |
| Worker API: logins, permission checks, first routes | Done. `/api/health`, `/api/me`, `/api/profiles/:username`, `/api/collection`, `/api/trade-list`. |
| Copy script, Supabase → D1 | Done. `scripts/copy-supabase-to-d1.mjs`. Not run against real data yet. |
| The rest of the API (see below) | Not started. |
| Switching the site's user-data calls from Supabase to `/api` | Not started. |
| Cutover | Not started. |

The live site still reads and writes all user data in Supabase. Nothing in
D1 is used yet, so there is nothing to roll back.

## How the pieces fit

- **Static files.** `scripts/export-static-data.mjs` runs before every build.
  It reads the shared tables from Supabase with the public key, checks every
  row count, and writes JSON into `public/data` (catalogue, reference tables,
  and learnsets split per Pokémon and per move). `src/lib/staticData.ts` loads
  them. Until the Admin data tools stop writing to Supabase, Supabase stays
  the source and each deploy re-exports. Afterwards: run the export once,
  commit `public/data`, remove it from `.gitignore`, and delete the script.
- **Worker.** `worker/index.ts`. Only `/api/*` runs it (`run_worker_first`);
  every page and data file is served straight from the static assets.
- **Logins.** The browser keeps using Supabase Auth and sends its access token
  as `Authorization: Bearer …`. `worker/auth.ts` verifies it against
  Supabase's published ES256 keys, so the Worker needs no secret.
- **Permissions.** D1 has no row-level security. Every route filters on the
  verified user id, and validates Pokémon ids against the static catalogue.
- **Profiles.** Created on a user's first API call from their sign-up
  metadata, replacing Supabase's `handle_new_user` trigger.

## Still to build

Each item replaces Supabase calls the site makes today.

1. **Collections:** collection views and presets
   (`activate_own_collection_view`, `update_own_active_collection_definition`),
   form preferences, game dex progress and activity.
2. **Account:** profile edits, username check, avatars (move the Supabase
   `avatars` bucket to R2), export (`export_own_collection_v4`), restore
   (collapse the four `restore_own_collection*` functions into one route that
   upgrades old backups first), delete account, clear progress.
3. **Friends and blocks:** requests, accept, remove, block, unblock,
   relationship lookups, compare collections.
4. **Chat:** conversations, members, messages, unread counts, read markers.
   Live updates need a Durable Object per conversation (WebSockets with
   hibernation) in place of Supabase Realtime.
5. **Forums:** categories, posts, comments, votes, admin pin/lock/remove.
6. **Reports and moderation:** submit and resolve, plus the mute and ban
   tools from the backlog.
7. **Bank tools:** checklist, ribbon plans, "last chance" list and its admin
   editor.
8. **Admin data tools:** write catalogue changes to files instead of
   Supabase tables.

## Cutover, when everything above is done

1. Pick a quiet evening. Put the site in read-only mode for the copy.
2. Run the copy script (below) with `--replace`.
3. Deploy the version of the site that uses `/api` for user data.
4. Check sign-in, ticking a Pokémon, chat and the forums with two accounts.
5. Keep Supabase's user tables untouched for a couple of weeks as a fallback,
   then drop them. Supabase Auth stays.

## Running the copy script

On your own computer, from the repo folder:

```sh
SUPABASE_SECRET_KEY=sb_secret_... CLOUDFLARE_API_TOKEN=... node scripts/copy-supabase-to-d1.mjs --dry-run
```

- `SUPABASE_SECRET_KEY`: Supabase dashboard → Project Settings → API Keys → a
  secret key. It bypasses Row Level Security, so never commit it.
- `CLOUDFLARE_API_TOKEN`: Cloudflare dashboard → My Profile → API Tokens →
  Create Token, with D1 Edit permission.

Drop `--dry-run` to copy. It refuses to overwrite a D1 database that already
has users unless you add `--replace`. Never use `--replace` after cutover: it
would roll everyone back to Supabase's copy.

## Testing

- `bun test worker`: 18 tests against the real D1 schema with real signed
  tokens, including forged, tampered and expired ones.
- Branch builds on Cloudflare run the static export against the real data and
  fail if any table comes back short.

## Things to know

- **Free plan limits.** D1 allows 100,000 row writes a day. Normal use is far
  below that, but never import the learnsets into D1: they're static files for
  exactly this reason.
- **Preview builds share the production D1 database** (the `previews` block in
  `wrangler.jsonc` is empty). Fine while D1 is unused; give previews their own
  database before cutover.
- **Migrations.** Add new files to `d1/migrations` and apply them with
  `npx wrangler d1 migrations apply devidex --remote`. `0001` is already
  applied and recorded in `d1_migrations`.
