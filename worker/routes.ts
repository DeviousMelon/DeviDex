// The first set of API routes. Each one does its own permission check before
// touching D1: there is no row-level security in SQLite, so the rule
// "you can only see and change your own rows" lives here instead, enforced by
// always filtering on the verified user id.
//
// Still to move from Supabase (each was a Postgres function or RLS policy):
// friends and blocks, chat (with Durable Objects for live updates), forums,
// reports, collection views and form preferences, game dex progress, Bank
// tools, account export/restore/delete. See docs/cloudflare-move.md.

import type { AuthUser } from './auth';
import { knownFormIds } from './catalog';
import { HttpError, fromBool, json, nowIso, optionalText, positiveInt, readJson, requireBoolean, toBool } from './http';

export type Context = { request: Request; env: Env; user: AuthUser | null; params: Record<string, string> };

function requireUser(ctx: Context): AuthUser {
  if (!ctx.user) throw new HttpError(401, 'You need to be signed in.');
  return ctx.user;
}

// ---------------------------------------------------------------------------
// Profiles

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  role: string;
  avatar_path: string | null;
  home_friend_code: string | null;
  home_friend_code_public: number;
  profile_public: number;
  collection_public: number;
  collection_friends_visible: number;
  created_at: string;
  updated_at: string;
};

function profileJson(row: ProfileRow) {
  return {
    ...row,
    home_friend_code_public: toBool(row.home_friend_code_public),
    profile_public: toBool(row.profile_public),
    collection_public: toBool(row.collection_public),
    collection_friends_visible: toBool(row.collection_friends_visible),
  };
}

const USERNAME = /^[A-Za-z0-9_-]{3,20}$/;
const RESERVED = new Set(['admin', 'administrator', 'devidex', 'support', 'moderator', 'official', 'system', 'staff', 'help', 'security']);

/**
 * Supabase created a profile whenever someone signed up (a trigger on its
 * auth.users table). D1 can't see that table, so the profile is created the
 * first time a signed-in user calls the API, from the same sign-up metadata.
 */
export async function ensureProfile(env: Env, user: AuthUser): Promise<ProfileRow> {
  const existing = await env.DB.prepare('SELECT * FROM profiles WHERE id = ?').bind(user.id).first<ProfileRow>();
  if (existing) return existing;

  const wanted = typeof user.metadata.username === 'string' ? user.metadata.username.trim() : '';
  const username = USERNAME.test(wanted) && !RESERVED.has(wanted.toLowerCase()) ? wanted : null;
  const displayName = typeof user.metadata.display_name === 'string' ? user.metadata.display_name.trim().slice(0, 60) || null : null;

  // ON CONFLICT (id) only covers two requests racing to create the same
  // profile. A taken username still raises, so it can be retried without one.
  const insert = 'INSERT INTO profiles (id, username, display_name) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING';
  try {
    await env.DB.prepare(insert).bind(user.id, username, displayName).run();
  } catch {
    // Username already taken: keep the account, drop the name. They can pick
    // another on the Account page.
    await env.DB.prepare(insert).bind(user.id, null, displayName).run();
  }
  const created = await env.DB.prepare('SELECT * FROM profiles WHERE id = ?').bind(user.id).first<ProfileRow>();
  if (!created) throw new HttpError(500, 'Couldn’t create your profile.');
  return created;
}

export async function getMe(ctx: Context) {
  const user = requireUser(ctx);
  return json({ profile: profileJson(await ensureProfile(ctx.env, user)) });
}

/** What anyone can see of a profile: nothing at all when it's private. */
export async function getPublicProfile(ctx: Context) {
  const username = ctx.params.username ?? '';
  const row = await ctx.env.DB.prepare('SELECT * FROM profiles WHERE lower(username) = lower(?)').bind(username).first<ProfileRow>();
  if (!row || (!toBool(row.profile_public) && row.id !== ctx.user?.id)) throw new HttpError(404, 'No profile with that username.');
  return json({
    profile: {
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      avatar_path: row.avatar_path,
      home_friend_code: toBool(row.home_friend_code_public) ? row.home_friend_code : null,
      created_at: row.created_at,
    },
  });
}

// ---------------------------------------------------------------------------
// National Dex progress

type ProgressRow = { form_id: number; normal_owned: number; shiny_owned: number; notes: string | null; updated_at: string };

export async function getCollection(ctx: Context) {
  const user = requireUser(ctx);
  await ensureProfile(ctx.env, user);
  const { results } = await ctx.env.DB.prepare(
    'SELECT form_id, normal_owned, shiny_owned, notes, updated_at FROM collection_progress WHERE user_id = ? ORDER BY form_id',
  )
    .bind(user.id)
    .all<ProgressRow>();
  return json({
    progress: results.map((row) => ({ ...row, normal_owned: toBool(row.normal_owned), shiny_owned: toBool(row.shiny_owned) })),
  });
}

/**
 * Ticks or unticks one form. Unticking both boxes deletes the row unless it
 * has notes, the same rule as the October "owns nothing" fix, so the table
 * only ever holds Pokémon someone actually has.
 */
export async function putCollection(ctx: Context) {
  const user = requireUser(ctx);
  const formId = positiveInt(ctx.params.formId, 'formId');
  if (!(await knownFormIds(ctx.env)).has(formId)) throw new HttpError(404, 'That Pokémon form isn’t in the DeviDex catalogue.');

  const body = await readJson<{ normal_owned?: unknown; shiny_owned?: unknown; notes?: unknown }>(ctx.request);
  const normal = requireBoolean(body.normal_owned, 'normal_owned');
  const shiny = requireBoolean(body.shiny_owned, 'shiny_owned');
  const notes = optionalText(body.notes, 'notes', 500);

  await ensureProfile(ctx.env, user);
  if (!normal && !shiny && !notes) {
    await ctx.env.DB.prepare('DELETE FROM collection_progress WHERE user_id = ? AND form_id = ?').bind(user.id, formId).run();
    return json({ progress: null });
  }

  const row = await ctx.env.DB.prepare(
    `INSERT INTO collection_progress (user_id, form_id, normal_owned, shiny_owned, notes)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, form_id) DO UPDATE SET
       normal_owned = excluded.normal_owned,
       shiny_owned = excluded.shiny_owned,
       notes = excluded.notes,
       updated_at = ?
     RETURNING form_id, normal_owned, shiny_owned, notes, updated_at`,
  )
    .bind(user.id, formId, fromBool(normal), fromBool(shiny), notes, nowIso())
    .first<ProgressRow>();
  return json({ progress: row && { ...row, normal_owned: toBool(row.normal_owned), shiny_owned: toBool(row.shiny_owned) } });
}

// ---------------------------------------------------------------------------
// Trade list (spares someone is offering)

type TradeRow = { form_id: number; shiny: number; note: string | null; created_at: string };

export async function getTradeList(ctx: Context) {
  const user = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare(
    'SELECT form_id, shiny, note, created_at FROM trade_list WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(user.id)
    .all<TradeRow>();
  return json({ tradeList: results.map((row) => ({ ...row, shiny: toBool(row.shiny) })) });
}

export async function putTradeItem(ctx: Context) {
  const user = requireUser(ctx);
  const body = await readJson<{ form_id?: unknown; shiny?: unknown; note?: unknown }>(ctx.request);
  const formId = positiveInt(body.form_id, 'form_id');
  const shiny = requireBoolean(body.shiny, 'shiny');
  const note = optionalText(body.note, 'note', 140);
  if (!(await knownFormIds(ctx.env)).has(formId)) throw new HttpError(404, 'That Pokémon form isn’t in the DeviDex catalogue.');

  await ensureProfile(ctx.env, user);
  await ctx.env.DB.prepare(
    `INSERT INTO trade_list (user_id, form_id, shiny, note) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, form_id, shiny) DO UPDATE SET note = excluded.note`,
  )
    .bind(user.id, formId, fromBool(shiny), note)
    .run();
  return json({ ok: true });
}

export async function deleteTradeItem(ctx: Context) {
  const user = requireUser(ctx);
  const formId = positiveInt(ctx.params.formId, 'formId');
  const shiny = new URL(ctx.request.url).searchParams.get('shiny') === 'true';
  await ctx.env.DB.prepare('DELETE FROM trade_list WHERE user_id = ? AND form_id = ? AND shiny = ?')
    .bind(user.id, formId, fromBool(shiny))
    .run();
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Health

/** Says what's wrong instead of a bare 500, so a broken deploy is easy to spot. */
export async function getHealth(ctx: Context) {
  const checks: Record<string, unknown> = { signedIn: Boolean(ctx.user), supabaseUrl: Boolean(ctx.env.SUPABASE_URL) };
  if (!ctx.env.DB) return json({ ok: false, problem: 'This deploy has no D1 binding (DB).', ...checks }, 503);
  try {
    const row = await ctx.env.DB.prepare("SELECT count(*) AS tables FROM sqlite_master WHERE type = 'table'").first<{ tables: number }>();
    checks.d1Tables = row?.tables ?? 0;
  } catch (error) {
    return json({ ok: false, problem: `D1 query failed: ${error instanceof Error ? error.message : String(error)}`, ...checks }, 503);
  }
  try {
    checks.catalogForms = (await knownFormIds(ctx.env)).size;
  } catch (error) {
    return json({ ok: false, problem: `Static catalogue unreadable: ${error instanceof Error ? error.message : String(error)}`, ...checks }, 503);
  }
  return json({ ok: true, ...checks });
}
