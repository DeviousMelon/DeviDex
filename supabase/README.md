# DeviDex Supabase setup

1. Create a free Supabase project.
2. Open **SQL Editor** and run `migrations/001_schema.sql` once.
3. Open the project **Connect** panel and copy the Project URL + publishable key.
4. Copy `.env.example` to `.env.local` in the DeviDex project root.
5. Replace both placeholder values.
6. Restart `npm run dev` after changing environment variables.
7. Create your account at `/login`.
8. Copy your UUID from **Authentication -> Users**.
9. Put that UUID into `promote-admin.sql` and run it once.
10. Refresh/sign in again. The **Admin** navigation item will appear.

## Never expose the service-role key

The Vite browser app should use only the Supabase **publishable/anon** key. The
service-role key bypasses Row Level Security and must never be placed in frontend
source code, GitHub, or Cloudflare Pages client-side environment variables.
