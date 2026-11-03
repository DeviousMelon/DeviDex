#!/usr/bin/env node
// Copies DeviDex's user data from Supabase into the D1 database.
//
// Run it on your own computer, never in a build: it needs two private keys.
//
//   SUPABASE_SECRET_KEY=sb_secret_...  \
//   CLOUDFLARE_API_TOKEN=...           \
//   node scripts/copy-supabase-to-d1.mjs --dry-run
//
// SUPABASE_SECRET_KEY    Supabase dashboard -> Project Settings -> API Keys ->
//                        a secret key (sb_secret_...) or the legacy
//                        service_role key. It reads past Row Level Security, so
//                        never commit it or put it in .env.production.
// CLOUDFLARE_API_TOKEN   Cloudflare dashboard -> My Profile -> API Tokens ->
//                        Create Token -> "D1: Edit" for this account.
//
// Flags:
//   --dry-run   read everything and check it, write nothing
//   --replace   allowed to wipe a D1 database that already has users in it
//
// What it does: reads every user table from Supabase, converts the values for
// SQLite (true/false -> 1/0, arrays -> JSON text, timestamps -> ISO UTC),
// empties the D1 tables, inserts parents before children, then checks every
// table's row count. Rerunning it is safe: each run replaces the whole copy.
// If it stops halfway, just run it again.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const REPLACE = args.has('--replace');
const PAGE = 1000;
const MAX_PARAMS = 100; // D1's limit on bound values per query.

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '675ff6f70057788241affd98fe8383e2';
const DATABASE_ID = process.env.D1_DATABASE_ID ?? '77c5568e-ce81-4ece-a060-14dffd90a107';
const D1_API = process.env.D1_API_BASE ?? 'https://api.cloudflare.com/client/v4';

function fail(message) {
  console.error(`\n[copy-to-d1] ${message}\n`);
  process.exit(1);
}

function supabaseUrl() {
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL.replace(/\/$/, '');
  const file = path.join(root, '.env.production');
  if (existsSync(file)) {
    const match = readFileSync(file, 'utf8').match(/^VITE_SUPABASE_URL=(.+)$/m);
    if (match) return match[1].trim().replace(/\/$/, '');
  }
  fail('Set SUPABASE_URL.');
}

// Tables in insert order: every table comes after the tables it points at.
// `order` is the primary key, so paging is stable. `json` columns are Postgres
// arrays stored as JSON text in SQLite. `bool` columns become 0/1.
const TABLES = [
  { name: 'profiles', order: 'id', userColumn: 'id',
    columns: ['id', 'username', 'display_name', 'role', 'avatar_path', 'home_friend_code', 'home_friend_code_public', 'profile_public', 'collection_public', 'collection_friends_visible', 'created_at', 'updated_at'] },
  { name: 'forum_categories', order: 'id',
    columns: ['id', 'slug', 'name', 'description', 'sort_order', 'admin_only_posts', 'created_at'] },
  { name: 'bank_last_chance', order: 'id',
    columns: ['id', 'slug', 'title', 'category', 'description', 'species_id', 'form_id', 'source_url', 'sort_order', 'is_published', 'created_at', 'updated_at'] },
  { name: 'user_form_preferences', order: 'user_id', userColumn: 'user_id',
    columns: ['user_id', 'include_regional', 'include_alternate', 'include_pattern', 'include_gender', 'include_battle', 'include_special', 'created_at', 'updated_at'] },
  { name: 'user_collection_views', order: 'id', userColumn: 'user_id',
    columns: ['id', 'user_id', 'name', 'preset_id', 'goal', 'include_regional', 'include_alternate', 'include_pattern', 'include_gender', 'include_battle', 'include_special', 'is_active', 'created_at', 'updated_at'] },
  { name: 'collection_progress', order: 'user_id,form_id', userColumn: 'user_id',
    columns: ['user_id', 'form_id', 'normal_owned', 'shiny_owned', 'notes', 'created_at', 'updated_at'] },
  { name: 'game_collection_progress', order: 'user_id,game_id,species_id', userColumn: 'user_id',
    columns: ['user_id', 'game_id', 'species_id', 'normal_owned', 'shiny_owned', 'notes', 'created_at', 'updated_at'] },
  { name: 'game_form_collection_progress', order: 'user_id,game_id,form_id', userColumn: 'user_id',
    columns: ['user_id', 'game_id', 'form_id', 'normal_owned', 'shiny_owned', 'notes', 'created_at', 'updated_at'] },
  { name: 'game_dex_activity', order: 'user_id,set_id', userColumn: 'user_id',
    columns: ['user_id', 'set_id', 'game_id', 'started_at', 'last_activity_at'] },
  { name: 'trade_list', order: 'user_id,form_id,shiny', userColumn: 'user_id',
    columns: ['user_id', 'form_id', 'shiny', 'note', 'created_at'] },
  { name: 'friendships', order: 'id',
    columns: ['id', 'requester_id', 'addressee_id', 'status', 'created_at', 'responded_at'] },
  { name: 'user_blocks', order: 'blocker_id,blocked_id',
    columns: ['blocker_id', 'blocked_id', 'created_at'] },
  { name: 'conversations', order: 'id',
    columns: ['id', 'kind', 'title', 'direct_key', 'created_by', 'created_at', 'last_message_at'] },
  { name: 'conversation_members', order: 'conversation_id,user_id', userColumn: 'user_id',
    columns: ['conversation_id', 'user_id', 'role', 'joined_at', 'last_read_at'] },
  { name: 'messages', order: 'id',
    columns: ['id', 'conversation_id', 'sender_id', 'kind', 'body', 'pokemon_form_id', 'pokemon_shiny', 'created_at', 'deleted_at'] },
  { name: 'forum_posts', order: 'id',
    columns: ['id', 'category_id', 'author_id', 'title', 'body', 'pokemon_form_id', 'is_pinned', 'is_locked', 'score', 'comment_count', 'created_at', 'edited_at', 'last_activity_at', 'deleted_at', 'removed_by_admin'] },
  // Replies point at their parent comment, so shallower comments go first.
  { name: 'forum_comments', order: 'id', sortBy: (a, b) => a.depth - b.depth,
    columns: ['id', 'post_id', 'parent_id', 'author_id', 'body', 'depth', 'score', 'created_at', 'edited_at', 'deleted_at', 'removed_by_admin'] },
  { name: 'forum_post_votes', order: 'post_id,user_id', userColumn: 'user_id',
    columns: ['post_id', 'user_id', 'value'] },
  { name: 'forum_comment_votes', order: 'comment_id,user_id', userColumn: 'user_id',
    columns: ['comment_id', 'user_id', 'value'] },
  { name: 'reports', order: 'id',
    columns: ['id', 'reporter_id', 'target_type', 'target_id', 'target_user_id', 'target_username', 'content_snapshot', 'reason', 'details', 'status', 'admin_note', 'created_at', 'resolved_at', 'resolved_by'] },
  { name: 'bank_checklist', order: 'id', userColumn: 'user_id',
    columns: ['id', 'user_id', 'label', 'form_id', 'shiny', 'location', 'box_note', 'hold_for_ribbons', 'moved_at', 'created_at', 'updated_at'] },
  { name: 'ribbon_plans', order: 'id', userColumn: 'user_id', json: ['completed_ribbons', 'skipped_ribbons'],
    columns: ['id', 'user_id', 'label', 'form_id', 'shiny', 'origin', 'current_stage', 'completed_ribbons', 'skipped_ribbons', 'notes', 'created_at', 'updated_at'] },
  { name: 'bank_last_chance_done', order: 'user_id,entry_id', userColumn: 'user_id',
    columns: ['user_id', 'entry_id', 'created_at'] },
];

const TIMESTAMP = /(_at)$/;

/** Converts one Supabase value to what the D1 column expects. */
function convert(table, column, value) {
  if (value === null || value === undefined) return null;
  if (table.json?.includes(column)) return JSON.stringify(value ?? []);
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (TIMESTAMP.test(column) && typeof value === 'string') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) fail(`${table.name}.${column}: can't read timestamp ${value}`);
    return date.toISOString();
  }
  return value;
}

async function readSupabase(base, key, table) {
  const rows = [];
  let total = Number.NaN;
  for (let from = 0; ; from += PAGE) {
    const url = `${base}/rest/v1/${table.name}?select=${encodeURIComponent(table.columns.join(','))}&order=${encodeURIComponent(table.order)}`;
    const response = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items', Prefer: 'count=exact' },
    });
    if (!response.ok && response.status !== 206) fail(`Supabase ${table.name}: HTTP ${response.status} ${await response.text()}`);
    total = Number((response.headers.get('content-range') ?? '').split('/')[1]);
    const page = await response.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  if (Number.isFinite(total) && rows.length !== total) fail(`Supabase ${table.name}: read ${rows.length} of ${total} rows.`);
  return rows;
}

async function d1(token, sql, params = []) {
  const response = await fetch(`${D1_API}/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const reason = body.errors?.map((e) => e.message).join('; ') || `HTTP ${response.status}`;
    throw new Error(`D1: ${reason}\n  SQL: ${sql.slice(0, 160)}`);
  }
  return body.result?.[0]?.results ?? [];
}

async function main() {
  const base = supabaseUrl();
  const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!supabaseKey) fail('Set SUPABASE_SECRET_KEY (see the top of this file).');
  if (!cloudflareToken && !DRY_RUN) fail('Set CLOUDFLARE_API_TOKEN (see the top of this file).');

  console.log(`[copy-to-d1] Reading from ${base}${DRY_RUN ? ' (dry run: nothing will be written)' : ''}`);

  // 1. Read and convert everything first, so a read problem never leaves D1 half-empty.
  const data = new Map();
  let profileIds = new Set();
  const skipped = {};
  for (const table of TABLES) {
    let rows = await readSupabase(base, supabaseKey, table);
    if (table.name === 'profiles') profileIds = new Set(rows.map((row) => row.id));
    // Supabase let a few tables point at auth.users directly; D1 hangs them
    // off profiles. Rows for a user with no profile can't be kept.
    if (table.userColumn && table.name !== 'profiles') {
      const before = rows.length;
      rows = rows.filter((row) => profileIds.has(row[table.userColumn]));
      if (rows.length !== before) skipped[table.name] = before - rows.length;
    }
    if (table.sortBy) rows.sort(table.sortBy);
    data.set(table.name, rows.map((row) => table.columns.map((column) => convert(table, column, row[column]))));
    console.log(`[copy-to-d1]   ${table.name}: ${rows.length}`);
  }
  for (const [name, count] of Object.entries(skipped)) {
    console.warn(`[copy-to-d1] Skipped ${count} ${name} row(s) belonging to users with no profile.`);
  }
  if (DRY_RUN) {
    console.log('[copy-to-d1] Dry run finished. Run again without --dry-run to copy.');
    return;
  }

  // 2. Refuse to overwrite a D1 copy that's already in use, unless told to.
  const [{ n: existing }] = await d1(cloudflareToken, 'SELECT count(*) AS n FROM profiles');
  if (existing > 0 && !REPLACE) {
    fail(`D1 already has ${existing} profile(s). If that's an old copy, rerun with --replace. If the site already runs on D1, DON'T: this would roll everyone back to Supabase's data.`);
  }

  // 3. Empty D1, children before parents.
  for (const table of [...TABLES].reverse()) await d1(cloudflareToken, `DELETE FROM ${table.name}`);

  // 4. Insert parents before children, in chunks that fit D1's 100-value limit.
  for (const table of TABLES) {
    const rows = data.get(table.name);
    if (table.name === 'user_collection_views') {
      // Inserting profiles fires the "default collection setup" trigger. The
      // real setups are about to be copied, so clear those placeholders first.
      await d1(cloudflareToken, 'DELETE FROM user_collection_views');
    }
    const perQuery = Math.max(1, Math.floor(MAX_PARAMS / table.columns.length));
    const placeholders = `(${table.columns.map(() => '?').join(', ')})`;
    for (let i = 0; i < rows.length; i += perQuery) {
      const chunk = rows.slice(i, i + perQuery);
      await d1(
        cloudflareToken,
        `INSERT INTO ${table.name} (${table.columns.join(', ')}) VALUES ${chunk.map(() => placeholders).join(', ')}`,
        chunk.flat(),
      );
    }
  }

  // 5. Check every table arrived whole.
  let mismatches = 0;
  for (const table of TABLES) {
    const [{ n }] = await d1(cloudflareToken, `SELECT count(*) AS n FROM ${table.name}`);
    const expected = data.get(table.name).length;
    if (n !== expected) {
      mismatches += 1;
      console.error(`[copy-to-d1] ${table.name}: expected ${expected}, D1 has ${n}`);
    }
  }
  if (mismatches) fail(`${mismatches} table(s) didn't match. Run the script again.`);
  console.log(`[copy-to-d1] Done: ${TABLES.length} tables copied and checked.`);
}

main().catch((error) => fail(error?.stack ?? String(error)));
