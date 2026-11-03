// Run with: bun test worker
// Uses the real D1 schema on an in-memory SQLite database, and real ES256
// tokens signed with a throwaway key, served from a fake Supabase key list.
import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resetKeyCache } from './auth';
import { resetCatalogCache } from './catalog';
import worker from './index';

const SUPABASE_URL = 'https://test-project.supabase.co';
const ORIGIN = 'https://devidex.test';
const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

// --- A D1-shaped wrapper around bun:sqlite --------------------------------
function d1(db: Database): D1Database {
  const statement = (sql: string, values: unknown[] = []): D1PreparedStatement => ({
    bind: (...next) => statement(sql, next),
    async first<T>() {
      return (db.query(sql).get(...(values as never[])) as T) ?? null;
    },
    async all<T>() {
      return { results: db.query(sql).all(...(values as never[])) as T[], success: true, meta: {} as never };
    },
    async run() {
      const info = db.query(sql).run(...(values as never[]));
      return { results: [], success: true, meta: { changes: info.changes } as never };
    },
  });
  return { prepare: (sql) => statement(sql), batch: async (list) => Promise.all(list.map((s) => s.run())) };
}

// --- Keys and tokens -------------------------------------------------------
const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString('base64url');

const realKey = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const otherKey = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicJwk = { ...(await crypto.subtle.exportKey('jwk', realKey.publicKey)), kid: 'kid-1', alg: 'ES256', use: 'sig' };

async function token(claims: Record<string, unknown>, key = realKey.privateKey, kid = 'kid-1') {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' })));
  const payload = b64url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: `${SUPABASE_URL}/auth/v1`,
        aud: 'authenticated',
        role: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
        ...claims,
      }),
    ),
  );
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(signature)}`;
}

// --- Test harness ----------------------------------------------------------
let db: Database;
let env: Env;
let keyFetches = 0;

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`) {
    keyFetches += 1;
    return new Response(JSON.stringify({ keys: [publicJwk] }), { headers: { 'content-type': 'application/json' } });
  }
  return realFetch(input as RequestInfo);
}) as typeof fetch;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(readFileSync(new URL('../d1/migrations/0001_user_data.sql', import.meta.url), 'utf8'));
  env = {
    DB: d1(db),
    SUPABASE_URL,
    ASSETS: {
      async fetch(input: Request | string) {
        const path = new URL(input instanceof Request ? input.url : input).pathname;
        if (path === '/data/catalog/pokemon_forms.json') return Response.json([{ id: 1 }, { id: 25 }, { id: 150 }]);
        return new Response('<html>site</html>', { headers: { 'content-type': 'text/html' } });
      },
    },
  };
  resetKeyCache();
  resetCatalogCache();
  keyFetches = 0;
});

async function call(method: string, path: string, options: { token?: string; body?: unknown; origin?: string } = {}) {
  const headers: Record<string, string> = {};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') headers.origin = options.origin ?? ORIGIN;
  const response = await worker.fetch(
    new Request(`${ORIGIN}${path}`, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }),
    env,
  );
  return { status: response.status, body: (await response.json().catch(() => null)) as any, headers: response.headers };
}

// --- Tests -----------------------------------------------------------------
describe('routing', () => {
  test('non-API paths go to the static site', async () => {
    const response = await worker.fetch(new Request(`${ORIGIN}/dex`), env);
    expect(await response.text()).toContain('site');
  });

  test('unknown routes and methods', async () => {
    expect((await call('GET', '/api/nope')).status).toBe(404);
    expect((await call('POST', '/api/me')).status).toBe(405);
  });

  test('health works signed out and is never cached', async () => {
    const res = await call('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.body.d1Tables).toBeGreaterThan(20);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('logins', () => {
  test('a valid token signs you in and creates your profile once', async () => {
    const t = await token({ sub: ALICE, user_metadata: { username: 'Devi_01' } });
    const first = await call('GET', '/api/me', { token: t });
    expect(first.status).toBe(200);
    expect(first.body.profile.username).toBe('Devi_01');
    expect(first.body.profile.profile_public).toBe(true);
    await call('GET', '/api/me', { token: t });
    expect(db.query('SELECT count(*) AS n FROM profiles').get()).toEqual({ n: 1 });
    // The default collection setup arrives with the profile, as on Supabase.
    expect(db.query('SELECT name FROM user_collection_views WHERE user_id = ?').get(ALICE)).toEqual({ name: 'Main Collection' });
    // Keys are cached rather than fetched per request.
    expect(keyFetches).toBe(1);
  });

  test('no token means signed out', async () => {
    expect((await call('GET', '/api/me')).status).toBe(401);
  });

  test('a token signed with someone else’s key is rejected', async () => {
    const forged = await token({ sub: ALICE }, otherKey.privateKey);
    const res = await call('GET', '/api/me', { token: forged });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('signature');
  });

  test('a tampered token is rejected', async () => {
    const t = await token({ sub: ALICE });
    const [h, , s] = t.split('.');
    const evil = Buffer.from(JSON.stringify({ sub: BOB, iss: `${SUPABASE_URL}/auth/v1`, aud: 'authenticated', role: 'authenticated', exp: 9999999999 })).toString('base64url');
    expect((await call('GET', '/api/me', { token: `${h}.${evil}.${s}` })).status).toBe(401);
  });

  test('expired, wrong-project and anonymous-role tokens are rejected', async () => {
    expect((await call('GET', '/api/me', { token: await token({ sub: ALICE, exp: 1000 }) })).body.error).toContain('expired');
    expect((await call('GET', '/api/me', { token: await token({ sub: ALICE, iss: 'https://evil.supabase.co/auth/v1' }) })).status).toBe(401);
    expect((await call('GET', '/api/me', { token: await token({ sub: ALICE, role: 'anon' }) })).status).toBe(401);
  });

  test('an unknown key id refetches the key list once, then fails', async () => {
    const res = await call('GET', '/api/me', { token: await token({ sub: ALICE }, realKey.privateKey, 'rotated-away') });
    expect(res.status).toBe(401);
    expect(keyFetches).toBe(2);
  });

  test('a taken username still creates the account, without the name', async () => {
    await call('GET', '/api/me', { token: await token({ sub: ALICE, user_metadata: { username: 'Devi_01' } }) });
    const res = await call('GET', '/api/me', { token: await token({ sub: BOB, user_metadata: { username: 'devi_01' } }) });
    expect(res.status).toBe(200);
    expect(res.body.profile.username).toBeNull();
  });

  test('reserved and invalid usernames are dropped', async () => {
    const res = await call('GET', '/api/me', { token: await token({ sub: ALICE, user_metadata: { username: 'Admin' } }) });
    expect(res.body.profile.username).toBeNull();
  });
});

describe('collection progress', () => {
  test('tick, update and untick a form', async () => {
    const t = await token({ sub: ALICE });
    let res = await call('PUT', '/api/collection/25', { token: t, body: { normal_owned: true, shiny_owned: false } });
    expect(res.status).toBe(200);
    expect(res.body.progress).toMatchObject({ form_id: 25, normal_owned: true, shiny_owned: false });

    res = await call('PUT', '/api/collection/25', { token: t, body: { normal_owned: true, shiny_owned: true, notes: '  OT Devi ' } });
    expect(res.body.progress).toMatchObject({ shiny_owned: true, notes: 'OT Devi' });

    // Unticking both keeps the row while it has notes...
    res = await call('PUT', '/api/collection/25', { token: t, body: { normal_owned: false, shiny_owned: false, notes: 'OT Devi' } });
    expect(res.body.progress).not.toBeNull();
    // ...and deletes it once the notes are gone too.
    res = await call('PUT', '/api/collection/25', { token: t, body: { normal_owned: false, shiny_owned: false } });
    expect(res.body.progress).toBeNull();
    expect(db.query('SELECT count(*) AS n FROM collection_progress').get()).toEqual({ n: 0 });
  });

  test('you only ever see your own progress', async () => {
    await call('PUT', '/api/collection/25', { token: await token({ sub: ALICE }), body: { normal_owned: true, shiny_owned: false } });
    const bob = await call('GET', '/api/collection', { token: await token({ sub: BOB }) });
    expect(bob.body.progress).toEqual([]);
    const alice = await call('GET', '/api/collection', { token: await token({ sub: ALICE }) });
    expect(alice.body.progress).toHaveLength(1);
  });

  test('bad input is refused', async () => {
    const t = await token({ sub: ALICE });
    expect((await call('PUT', '/api/collection/9999', { token: t, body: { normal_owned: true, shiny_owned: false } })).status).toBe(404);
    expect((await call('PUT', '/api/collection/abc', { token: t, body: { normal_owned: true, shiny_owned: false } })).status).toBe(400);
    expect((await call('PUT', '/api/collection/25', { token: t, body: { normal_owned: 'yes', shiny_owned: false } })).status).toBe(400);
    expect((await call('PUT', '/api/collection/25', { token: t, body: { normal_owned: true, shiny_owned: false, notes: 'x'.repeat(501) } })).status).toBe(400);
    expect((await call('PUT', '/api/collection/25', { token: t, body: { normal_owned: true, shiny_owned: false } })).status).toBe(200);
  });

  test('writes from another website are blocked', async () => {
    const res = await call('PUT', '/api/collection/25', {
      token: await token({ sub: ALICE }),
      body: { normal_owned: true, shiny_owned: false },
      origin: 'https://evil.example',
    });
    expect(res.status).toBe(403);
  });

  test('signed out you can’t write', async () => {
    expect((await call('PUT', '/api/collection/25', { body: { normal_owned: true, shiny_owned: false } })).status).toBe(401);
  });
});

describe('trade list and public profiles', () => {
  test('add, list and remove spares', async () => {
    const t = await token({ sub: ALICE });
    expect((await call('PUT', '/api/trade-list', { token: t, body: { form_id: 150, shiny: true, note: 'Event Mewtwo' } })).status).toBe(200);
    expect((await call('PUT', '/api/trade-list', { token: t, body: { form_id: 150, shiny: false } })).status).toBe(200);
    let list = await call('GET', '/api/trade-list', { token: t });
    expect(list.body.tradeList).toHaveLength(2);
    await call('DELETE', '/api/trade-list/150?shiny=true', { token: t });
    list = await call('GET', '/api/trade-list', { token: t });
    expect(list.body.tradeList).toEqual([expect.objectContaining({ form_id: 150, shiny: false })]);
  });

  test('private profiles and hidden friend codes stay hidden', async () => {
    await call('GET', '/api/me', { token: await token({ sub: ALICE, user_metadata: { username: 'Devi_01' } }) });
    db.query("UPDATE profiles SET home_friend_code = 'ABCD1234' WHERE id = ?").run(ALICE);
    let res = await call('GET', '/api/profiles/devi_01');
    expect(res.status).toBe(200);
    expect(res.body.profile.home_friend_code).toBeNull();

    db.query('UPDATE profiles SET profile_public = 0 WHERE id = ?').run(ALICE);
    expect((await call('GET', '/api/profiles/Devi_01')).status).toBe(404);
    // You can still see your own.
    res = await call('GET', '/api/profiles/Devi_01', { token: await token({ sub: ALICE }) });
    expect(res.status).toBe(200);
  });
});
