#!/usr/bin/env node
// Exports DeviDex's shared, read-only data from Supabase into static JSON files
// under public/data, so the site can load it from Cloudflare instead of the
// database.
//
// Runs before every build (see "build" in package.json). It only reads tables
// that signed-out visitors can already read, so the normal publishable key is
// enough: no secrets.
//
// While the Admin page's data tools still write to Supabase, Supabase stays the
// source of truth and each deploy re-exports a fresh copy. Once the move is
// finished, run this one last time, commit public/data, and delete this script.
//
// Usage:
//   node scripts/export-static-data.mjs              export (fails loudly on any error)
//   node scripts/export-static-data.mjs --if-missing skip if public/data already exists

import { mkdir, rm, rename, writeFile, readFile, stat } from 'node:fs/promises';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'data');
// Everything is written here first and only swapped in once the export is
// complete, so a failed export never destroys the last good copy.
const workDir = path.join(root, 'public', `.data-export-${process.pid}`);
const PAGE = 1000; // Supabase's default max rows per request.

// Tables copied whole. Timestamps are dropped: nothing in the browser reads them.
const DROP_COLUMNS = new Set(['created_at', 'updated_at']);

/** file name -> { table, order } */
const WHOLE_TABLES = {
  'catalog/pokemon_species': { table: 'pokemon_species', order: 'id' },
  'catalog/pokemon_forms': { table: 'pokemon_forms', order: 'id' },
  'catalog/games': { table: 'games', order: 'id' },
  'catalog/game_dex_sets': { table: 'game_dex_sets', order: 'id' },
  'catalog/game_dex_set_members': { table: 'game_dex_set_members', order: 'set_id,game_id' },
  'catalog/game_dex_set_entries': { table: 'game_dex_set_entries', order: 'set_id,dex_slug,species_id' },
  'catalog/game_form_availability': { table: 'game_form_availability', order: 'game_id,form_id' },
  'catalog/game_dex_version_exclusives': { table: 'game_dex_version_exclusives', order: 'set_id,species_id,game_id' },
  'ref/ref_types': { table: 'ref_types', order: 'id' },
  'ref/ref_type_efficacy': { table: 'ref_type_efficacy', order: 'attacking_type_id,defending_type_id' },
  'ref/ref_type_efficacy_past': { table: 'ref_type_efficacy_past', order: 'attacking_type_id,defending_type_id,until_generation' },
  'ref/ref_moves': { table: 'ref_moves', order: 'id' },
  'ref/ref_abilities': { table: 'ref_abilities', order: 'id' },
  'ref/ref_items': { table: 'ref_items', order: 'id' },
  'ref/ref_natures': { table: 'ref_natures', order: 'id' },
  'ref/ref_egg_groups': { table: 'ref_egg_groups', order: 'id' },
  'ref/ref_version_groups': { table: 'ref_version_groups', order: 'id' },
  'ref/ref_species': { table: 'ref_species', order: 'species_id' },
  'ref/ref_pokemon': { table: 'ref_pokemon', order: 'id' },
  'ref/ref_pokemon_types_past': { table: 'ref_pokemon_types_past', order: 'pokemon_id,until_generation' },
  'ref/ref_form_pokemon': { table: 'ref_form_pokemon', order: 'form_id' },
};

// Learnsets are 160,000+ rows, far too many for one file. They are split two
// ways so each page only downloads what it needs:
//   ref/learnsets/by-pokemon/<pokemon_id>.json  - one Pokémon's moves
//   ref/learnsets/by-move/<move_id>.json        - who learns one move
// Each row is a compact array: [pokemon_id, move_id, learn_method, level, version_group_ids].
const LEARNSETS = {
  table: 'ref_pokemon_moves',
  columns: 'pokemon_id,move_id,learn_method,level,version_group_ids',
  order: 'pokemon_id,move_id,learn_method,level',
};

async function loadEnv() {
  // Vite reads .env files for the browser build; this script runs before Vite,
  // so it reads them itself. Real environment variables (Cloudflare's build
  // settings) win over files.
  const values = {};
  for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const file = path.join(root, name);
    if (!existsSync(file)) continue;
    for (const line of (await readFile(file, 'utf8')).split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return { ...values, ...process.env };
}

function fail(message) {
  console.error(`\n[export-static-data] ${message}\n`);
  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    // Nothing to clean up.
  }
  process.exit(1);
}

async function request(base, key, table, { columns = '*', order, from }) {
  const url = `${base}/rest/v1/${table}?select=${encodeURIComponent(columns)}&order=${encodeURIComponent(order)}`;
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${from}-${from + PAGE - 1}`,
        'Range-Unit': 'items',
        Prefer: 'count=exact',
      },
    });
    if (response.ok || response.status === 206) {
      const total = Number((response.headers.get('content-range') ?? '').split('/')[1]);
      return { rows: await response.json(), total };
    }
    if (attempt >= 3 || response.status < 500) {
      fail(`${table}: HTTP ${response.status} ${await response.text()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
}

async function readTable(base, key, table, options) {
  const rows = [];
  let total = Number.NaN;
  for (let from = 0; ; from += PAGE) {
    const page = await request(base, key, table, { ...options, from });
    total = page.total;
    rows.push(...page.rows);
    if (page.rows.length < PAGE) break;
  }
  // A short read would silently ship a broken Dex, so it stops the build.
  if (Number.isFinite(total) && rows.length !== total) {
    fail(`${table}: read ${rows.length} rows but Supabase reports ${total}.`);
  }
  if (rows.length === 0) fail(`${table}: no rows. Refusing to ship empty data.`);
  return rows;
}

function strip(row) {
  const out = {};
  for (const [column, value] of Object.entries(row)) {
    if (!DROP_COLUMNS.has(column)) out[column] = value;
  }
  return out;
}

async function writeJson(name, value) {
  const file = path.join(workDir, `${name}.json`);
  await mkdir(path.dirname(file), { recursive: true });
  const text = JSON.stringify(value);
  await writeFile(file, text);
  return text.length;
}

async function main() {
  if (process.argv.includes('--if-missing') && existsSync(path.join(outDir, 'manifest.json'))) {
    console.log('[export-static-data] public/data already exists, skipping.');
    return;
  }

  const env = await loadEnv();
  const base = (env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
  if (!base || !key || base.includes('YOUR-PROJECT')) {
    fail('VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set (in .env locally, or in Cloudflare build settings).');
  }

  await rm(workDir, { recursive: true, force: true });
  const counts = {};
  let bytes = 0;

  for (const [name, { table, order }] of Object.entries(WHOLE_TABLES)) {
    const rows = (await readTable(base, key, table, { order })).map(strip);
    bytes += await writeJson(name, rows);
    counts[name] = rows.length;
    console.log(`[export-static-data] ${name}: ${rows.length} rows`);
  }

  const learnsets = await readTable(base, key, LEARNSETS.table, LEARNSETS);
  const byPokemon = new Map();
  const byMove = new Map();
  for (const row of learnsets) {
    const compact = [row.pokemon_id, row.move_id, row.learn_method, row.level, row.version_group_ids ?? []];
    if (!byPokemon.has(row.pokemon_id)) byPokemon.set(row.pokemon_id, []);
    if (!byMove.has(row.move_id)) byMove.set(row.move_id, []);
    byPokemon.get(row.pokemon_id).push(compact);
    byMove.get(row.move_id).push(compact);
  }
  for (const [id, rows] of byPokemon) bytes += await writeJson(`ref/learnsets/by-pokemon/${id}`, rows);
  for (const [id, rows] of byMove) bytes += await writeJson(`ref/learnsets/by-move/${id}`, rows);
  counts['ref/learnsets'] = learnsets.length;
  console.log(`[export-static-data] learnsets: ${learnsets.length} rows in ${byPokemon.size} + ${byMove.size} files`);

  const manifest = {
    format: 1,
    exportedAt: new Date().toISOString(),
    counts,
    learnsetPokemonIds: [...byPokemon.keys()].sort((a, b) => a - b),
    learnsetMoveIds: [...byMove.keys()].sort((a, b) => a - b),
  };
  await writeJson('manifest', manifest);

  const size = await stat(path.join(workDir, 'manifest.json'));
  if (!size.size) fail('manifest.json is empty.');

  await rm(outDir, { recursive: true, force: true });
  await rename(workDir, outDir);

  const mb = (bytes / 1024 / 1024).toFixed(1);
  console.log(`[export-static-data] done: ${Object.keys(counts).length} datasets, ${mb} MB.`);
}

main().catch((error) => fail(error?.stack ?? String(error)));
