// DeviDex's Cloudflare Worker.
//
// Every request that isn't /api/* goes straight to the static site (wrangler's
// run_worker_first only sends /api/* here, so pages and /data files don't even
// start this code). /api/* is the new backend: it checks the Supabase login
// token, then reads and writes user data in D1.

import { AuthError, userFromRequest } from './auth';
import { HttpError, errorResponse, json } from './http';
import {
  type Context,
  deleteTradeItem,
  getCollection,
  getHealth,
  getMe,
  getPublicProfile,
  getTradeList,
  putCollection,
  putTradeItem,
} from './routes';

type Handler = (ctx: Context) => Promise<Response>;
type Route = { method: string; pattern: RegExp; keys: string[]; handler: Handler };

const routes: Route[] = [];
function route(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp(
    `^${path.replace(/:([a-zA-Z]+)/g, (_, key: string) => {
      keys.push(key);
      return '([^/]+)';
    })}$`,
  );
  routes.push({ method, pattern, keys, handler });
}

route('GET', '/api/health', getHealth);
route('GET', '/api/me', getMe);
route('GET', '/api/profiles/:username', getPublicProfile);
route('GET', '/api/collection', getCollection);
route('PUT', '/api/collection/:formId', putCollection);
route('GET', '/api/trade-list', getTradeList);
route('PUT', '/api/trade-list', putTradeItem);
route('DELETE', '/api/trade-list/:formId', deleteTradeItem);

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const matches = routes.filter((item) => item.pattern.test(url.pathname));
  if (!matches.length) return json({ error: 'No such API route.' }, 404);
  const match = matches.find((item) => item.method === request.method);
  if (!match) return json({ error: 'Method not allowed.' }, 405);

  // Writes must come from the site itself, not another website posting with
  // someone's token. Browsers always send Origin on these requests.
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: 'Cross-site requests aren’t allowed.' }, 403);
  }

  try {
    const values = url.pathname.match(match.pattern)!.slice(1);
    const params = Object.fromEntries(match.keys.map((key, i) => [key, decodeURIComponent(values[i])]));
    let user = null;
    try {
      user = await userFromRequest(request, env.SUPABASE_URL);
    } catch (error) {
      if (error instanceof AuthError) throw new HttpError(401, error.message);
      throw error;
    }
    return await match.handler({ request, env, user, params });
  } catch (error) {
    return errorResponse(error);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
};
