import { supabase } from './supabase';
import { cleanError, NOT_CONFIGURED, type Result, type Row } from './rpc';
import { toSocialUser, type SocialUser } from './social';

// v1.8: comparing collections with friends and managing your trade list.

export interface CompareRow {
  formId: number;
  myNormal: boolean;
  myShiny: boolean;
  theirNormal: boolean;
  theirShiny: boolean;
  iOfferNormal: boolean;
  iOfferShiny: boolean;
  theyOfferNormal: boolean;
  theyOfferShiny: boolean;
}

export type CompareStatus = 'ok' | 'not_friends' | 'private';

export interface TradeListEntry {
  formId: number;
  shiny: boolean;
  note: string | null;
  createdAt: string;
}

export async function getFriendCompareInfo(username: string): Promise<Result<{ status: CompareStatus; friend: SocialUser | null }>> {
  if (!supabase) return { data: { status: 'not_friends', friend: null }, error: NOT_CONFIGURED };
  const { data, error } = await supabase.rpc('get_friend_compare_info', { friend_username: username });
  if (error) return { data: { status: 'not_friends', friend: null }, error: cleanError(error.message) };
  const row = (Array.isArray(data) ? data[0] : data) as Row | undefined;
  return {
    data: {
      status: (row?.status as CompareStatus) ?? 'not_friends',
      friend: row?.user_id ? toSocialUser(row) : null,
    },
    error: null,
  };
}

export async function compareCollectionWithFriend(username: string): Promise<Result<CompareRow[]>> {
  if (!supabase) return { data: [], error: NOT_CONFIGURED };

  // A full Living Dex can exceed PostgREST's default row cap, so page it.
  const PAGE_SIZE = 1000;
  const all: CompareRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .rpc('compare_collection_with_friend', { friend_username: username })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { data: [], error: cleanError(error.message) };
    const page = (data ?? []) as Row[];
    all.push(...page.map((row) => ({
      formId: Number(row.form_id),
      myNormal: Boolean(row.my_normal),
      myShiny: Boolean(row.my_shiny),
      theirNormal: Boolean(row.their_normal),
      theirShiny: Boolean(row.their_shiny),
      iOfferNormal: Boolean(row.i_offer_normal),
      iOfferShiny: Boolean(row.i_offer_shiny),
      theyOfferNormal: Boolean(row.they_offer_normal),
      theyOfferShiny: Boolean(row.they_offer_shiny),
    })));
    if (page.length < PAGE_SIZE) break;
  }
  return { data: all, error: null };
}

export async function getMyTradeList(): Promise<Result<TradeListEntry[]>> {
  if (!supabase) return { data: [], error: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from('trade_list')
    .select('form_id, shiny, note, created_at')
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: cleanError(error.message) };
  return {
    data: ((data ?? []) as Row[]).map((row) => ({
      formId: Number(row.form_id),
      shiny: Boolean(row.shiny),
      note: (row.note as string | null) ?? null,
      createdAt: String(row.created_at),
    })),
    error: null,
  };
}

export async function addToTradeList(userId: string, formId: number, shiny: boolean): Promise<Result> {
  if (!supabase) return { data: null, error: NOT_CONFIGURED };
  const { error } = await supabase
    .from('trade_list')
    .upsert({ user_id: userId, form_id: formId, shiny }, { onConflict: 'user_id,form_id,shiny', ignoreDuplicates: true });
  return { data: null, error: cleanError(error?.message) };
}

export async function updateTradeNote(userId: string, formId: number, shiny: boolean, note: string): Promise<Result> {
  if (!supabase) return { data: null, error: NOT_CONFIGURED };
  const { error } = await supabase
    .from('trade_list')
    .update({ note: note.trim() || null })
    .match({ user_id: userId, form_id: formId, shiny });
  return { data: null, error: cleanError(error?.message) };
}

export async function removeFromTradeList(userId: string, formId: number, shiny: boolean): Promise<Result> {
  if (!supabase) return { data: null, error: NOT_CONFIGURED };
  const { error } = await supabase.from('trade_list').delete().match({ user_id: userId, form_id: formId, shiny });
  return { data: null, error: cleanError(error?.message) };
}
