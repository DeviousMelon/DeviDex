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
