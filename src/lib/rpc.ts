import { supabase } from './supabase';

// Shared plumbing for the lib/ files that talk to Supabase (social, chat,
// forums, trades, bank). Previously each file carried its own copy.

export type Result<T = null> = { data: T; error: string | null };

/** A row as PostgREST hands it back, before we map it into a typed shape. */
export type Row = Record<string, unknown>;

export const NOT_CONFIGURED = 'Supabase is not configured.';

/** Supabase prefixes database errors with nothing useful; keep the message only. */
export function cleanError(message: string | undefined | null): string | null {
  if (!message) return null;
  return message.replace(/^.*?ERROR:\s*/, '');
}

/** An RPC result as a list of rows (anything else becomes an empty list). */
export const rows = (data: unknown) => (Array.isArray(data) ? (data as Row[]) : []);

/** Mapper for RPCs whose return value we don't need. */
export const nothing = () => null;

/** Call a database function and turn the reply into a Result. */
export async function callRpc<T>(
  name: string,
  args: Record<string, unknown> | undefined,
  map: (data: unknown) => T,
  fallback: T,
): Promise<Result<T>> {
  if (!supabase) return { data: fallback, error: NOT_CONFIGURED };
  const { data, error } = await supabase.rpc(name, args);
  if (error) return { data: fallback, error: cleanError(error.message) };
  return { data: map(data), error: null };
}
