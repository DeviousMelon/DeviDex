// Logins stay on Supabase Auth for now. The browser already holds a Supabase
// access token (a JWT); it sends it as "Authorization: Bearer <token>", and the
// Worker checks it here before touching any user data.
//
// Supabase signs tokens with ES256 and publishes its public keys, so this needs
// no secret: it fetches the key list, caches it, and verifies the signature
// with the Web Crypto API built into Workers.

export type AuthUser = {
  id: string;
  email: string | null;
  /** user_metadata from sign-up: may hold username / display_name. */
  metadata: Record<string, unknown>;
};

export class AuthError extends Error {}

type Jwk = JsonWebKey & { kid?: string; alg?: string };

const KEY_TTL_MS = 10 * 60 * 1000;
let keyCache: { url: string; fetchedAt: number; keys: Map<string, CryptoKey> } | null = null;

/** Clears the cached signing keys. Tests use this between runs. */
export function resetKeyCache() {
  keyCache = null;
}

async function loadKeys(supabaseUrl: string, force = false): Promise<Map<string, CryptoKey>> {
  const url = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`;
  if (!force && keyCache && keyCache.url === url && Date.now() - keyCache.fetchedAt < KEY_TTL_MS) {
    return keyCache.keys;
  }
  const response = await fetch(url);
  if (!response.ok) throw new AuthError(`Couldn't load Supabase signing keys (HTTP ${response.status}).`);
  const body = (await response.json()) as { keys?: Jwk[] };
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.kid) continue;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    keys.set(jwk.kid, key);
  }
  keyCache = { url, fetchedAt: Date.now(), keys };
  return keys;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodePart<T>(part: string): T {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part))) as T;
  } catch {
    throw new AuthError('Malformed token.');
  }
}

/** Verifies a Supabase access token and returns who it belongs to. */
export async function verifySupabaseToken(token: string, supabaseUrl: string): Promise<AuthUser> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError('Malformed token.');
  const [headerPart, payloadPart, signaturePart] = parts;

  const header = decodePart<{ alg?: string; kid?: string }>(headerPart);
  if (header.alg !== 'ES256' || !header.kid) throw new AuthError('Unsupported token.');

  let keys = await loadKeys(supabaseUrl);
  // Supabase rotates keys; an unknown key id means our cache is stale.
  if (!keys.has(header.kid)) keys = await loadKeys(supabaseUrl, true);
  const key = keys.get(header.kid);
  if (!key) throw new AuthError('Token signed with an unknown key.');

  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    base64UrlToBytes(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );
  if (!valid) throw new AuthError('Invalid token signature.');

  const claims = decodePart<{
    sub?: string;
    exp?: number;
    iss?: string;
    aud?: string | string[];
    role?: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  }>(payloadPart);

  const now = Math.floor(Date.now() / 1000);
  // A few seconds of leeway for clock drift between Supabase and Cloudflare.
  if (!claims.exp || claims.exp < now - 5) throw new AuthError('Token expired.');
  if (claims.iss !== `${supabaseUrl.replace(/\/$/, '')}/auth/v1`) throw new AuthError('Token from the wrong project.');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes('authenticated') || claims.role !== 'authenticated') {
    throw new AuthError('Not a signed-in user token.');
  }
  if (!claims.sub || !/^[0-9a-f-]{36}$/i.test(claims.sub)) throw new AuthError('Token has no user.');

  return { id: claims.sub, email: claims.email ?? null, metadata: claims.user_metadata ?? {} };
}

/** The signed-in user for this request, or null when no token was sent. */
export async function userFromRequest(request: Request, supabaseUrl: string): Promise<AuthUser | null> {
  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return verifySupabaseToken(match[1].trim(), supabaseUrl);
}
