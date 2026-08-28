# DeviDex: do this now

The React project is already connected to your Supabase project through
`.env.local`. There are only a few privileged steps I cannot perform with a
browser publishable key.

## 1. Create the database foundation

In Supabase, open **SQL Editor**, open `supabase/schema.sql` from this project,
and run the whole file.

## 2. Allow local email-confirmation redirects

In Supabase go to **Authentication -> URL Configuration**. While developing:

- Site URL: `http://localhost:5173`
- Add Redirect URL: `http://localhost:5173/**`

Later, add the Cloudflare Pages address here too.

## 3. Create your owner account

Run DeviDex:

```bash
npm install
npm run dev
```

Open `http://localhost:5173/login`, choose **Create account**, and register with:

`devidex314@gmail.com`

Use your own password. Do not put that password in source code or send it anywhere.
Confirm the email if Supabase asks you to.

## 4. Promote the owner account

Back in **Supabase -> SQL Editor**, run `supabase/promote-admin.sql`. It is already
configured for `devidex314@gmail.com`.

Refresh DeviDex or sign out/in. You should now see **Admin** in the navigation.

## 5. Optional sanity check

Run `supabase/verify-setup.sql`. The row for your email should report:

```text
role = admin
email_confirmed = true   (if email confirmation is enabled)
```
