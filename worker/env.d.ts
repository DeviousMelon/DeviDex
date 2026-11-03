// Just enough of the Cloudflare Workers types for this Worker. The official
// @cloudflare/workers-types package can replace this file once it's installed;
// the names match.

interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: { changes: number; last_row_id: number; rows_read: number; rows_written: number; duration: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface Env {
  /** The site's static files (dist), including /data. */
  ASSETS: Fetcher;
  /** User data. */
  DB: D1Database;
  /** e.g. https://vzbsgmhheuskpxjixfco.supabase.co — logins stay on Supabase Auth for now. */
  SUPABASE_URL: string;
}
