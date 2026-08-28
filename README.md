# DeviDex v0.2

React + TypeScript + Vite foundation for a collector-first Living Dex tracker.
This milestone adds routing, Supabase authentication and an admin role system while
preserving the original DeviDex dashboard design.

## Install / run

```bash
npm install
npm run dev
```

Because v0.2 adds packages, **run `npm install` again even if you installed v0.1**.

## New in v0.2

- React Router (`/`, `/login`, `/account`, `/admin`, etc.)
- Supabase browser client
- Email/password sign-in + registration UI
- Persistent auth sessions
- `profiles` table with `user` / `admin` roles
- Protected account route
- Admin-only route + dashboard shell
- PostgreSQL Row Level Security policies
- Cloudflare Pages SPA `_redirects`
- Graceful not-configured state before Supabase credentials are added
- Explanatory comments throughout the auth/routing code

## Connect Supabase

1. Create a free Supabase project.
2. Run `supabase/migrations/001_schema.sql` in Supabase's SQL Editor.
3. Copy `.env.example` to `.env.local`.
4. Put your Supabase Project URL and **publishable key** in `.env.local`.
5. Restart `npm run dev`.
6. Create your DeviDex account at `/login`.
7. Follow `supabase/promote-admin.sql` to make your account the admin.

See `supabase/README.md` for the detailed sequence.

## Important security idea

`AdminRoute.tsx` stops ordinary users seeing the admin interface, but **that alone is
not security**. The SQL Row Level Security rules are what stop someone from manually
calling the database API and performing admin-only operations.

## Project structure

```text
src/
├── components/
│   ├── ProtectedRoute.tsx
│   ├── SiteHeader.tsx
│   └── SiteFooter.tsx
├── context/AuthContext.tsx
├── data/samplePokemon.ts
├── lib/supabase.ts
├── pages/
│   ├── DashboardPage.tsx
│   ├── LoginPage.tsx
│   ├── AccountPage.tsx
│   ├── AdminPage.tsx
│   └── PlaceholderPage.tsx
├── App.tsx
├── main.tsx
└── styles.css

supabase/
├── migrations/001_schema.sql
├── promote-admin.sql
└── README.md
```

## Next milestone

The next logical build is the actual collection database: Pokémon species, forms,
games and per-user Living Dex entries that sync through Supabase.
