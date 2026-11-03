// Small helpers shared by every route.

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // User data must never be cached by the browser or Cloudflare.
      'cache-control': 'no-store',
    },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  console.error(error);
  return json({ error: 'Something went wrong on our side.' }, 500);
}

/** Reads a JSON body, capped at 64 KB so nobody can post a novel. */
export async function readJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (text.length > 64 * 1024) throw new HttpError(413, 'That request is too large.');
  try {
    return JSON.parse(text || '{}') as T;
  } catch {
    throw new HttpError(400, 'The request body isn’t valid JSON.');
  }
}

export const nowIso = () => new Date().toISOString();

/** SQLite stores booleans as 0/1. */
export const toBool = (value: unknown) => value === 1 || value === true;
export const fromBool = (value: unknown) => (value === true || value === 1 ? 1 : 0);

export function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new HttpError(400, `${name} must be true or false.`);
  return value;
}

export function optionalText(value: unknown, name: string, max: number): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new HttpError(400, `${name} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new HttpError(400, `${name} can be at most ${max} characters.`);
  return trimmed || null;
}

export function positiveInt(value: unknown, name: string): number {
  const number = typeof value === 'string' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number <= 0) {
    throw new HttpError(400, `${name} must be a positive whole number.`);
  }
  return number;
}
