# DeviDex v0.2.1

React + TypeScript + Vite foundation for a collector-first Living Dex tracker.
This build has the supplied Supabase project connected locally and includes the
authentication/admin foundation.

## Run it

```bash
npm install
npm run dev
```

The Supabase Project URL and **publishable browser key** are already present in
`.env.local`, so the login page should no longer show the “not connected” notice.

> `.env.local` is ignored by Git. The value stored there is a Supabase
> **publishable** key, never a service-role key.

## One-time Supabase setup you still need to do

The browser key can connect the website to Supabase, but it cannot create database
tables or grant itself admin powers. That would rather defeat the point of having
security.

1. Open your Supabase project.
2. Go to **SQL Editor**.
3. Paste/run `supabase/schema.sql` once.
4. In **Authentication -> URL Configuration**, set the local Site URL to `http://localhost:5173` and allow `http://localhost:5173/**` as a redirect URL.
5. Start DeviDex and open `/login`.
6. Create the owner account using `devidex314@gmail.com`.
7. Confirm the email if Supabase requires confirmation.
8. Back in **SQL Editor**, paste/run `supabase/promote-admin.sql` once.
9. Sign out/in or refresh DeviDex. The **Admin** navigation item should appear.
10. Optional: run `supabase/verify-setup.sql` to verify the result.

## Authentication architecture

- Supabase Auth verifies email/password and owns password storage.
- `public.profiles.role` stores `user` or `admin`.
- React's `AdminRoute` controls whether the admin UI renders.
- PostgreSQL Row Level Security is the real data security boundary.
- The service-role key must never be placed in this frontend.

## Cloudflare later

`.env.local` only configures your local Vite build. When DeviDex goes onto
Cloudflare Pages, add the same two variables to the Cloudflare project's build
environment:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Then redeploy so Vite includes them in the production build.

## Useful project files

```text
src/lib/supabase.ts            Supabase browser client
src/context/AuthContext.tsx   Session/profile handling
src/components/ProtectedRoute.tsx
src/pages/LoginPage.tsx
src/pages/AdminPage.tsx
supabase/schema.sql           One-time database foundation
supabase/promote-admin.sql    Makes devidex314@gmail.com admin
supabase/verify-setup.sql     Sanity check
.env.local                    Local Supabase connection
```

## Next milestone

Once login/admin is confirmed against the live Supabase project, the next build is
the real collection database: species, forms, games, user collections and Living
Dex completion synced through Supabase.
