import { supabase } from './supabase';
import { cleanError, type Result } from './social';
import type { RibbonOrigin, RibbonStage } from './bankRibbons';

// v2.0: Pokémon Bank shutdown prep.

/**
 * The one place the deadline lives. The Pokémon Company: Thu 25 Feb 2027,
 * 7:00pm PT = Fri 26 Feb 2027, 12:00 JST = 03:00 UTC (and Irish time).
 */
export const BANK_DEADLINE = new Date('2027-02-26T03:00:00Z');

export function bankIsOpen(now: number = Date.now()) {
  return now < BANK_DEADLINE.getTime();
}

export function timeLeft(now: number = Date.now()) {
  const totalMs = Math.max(BANK_DEADLINE.getTime() - now, 0);
  const totalMinutes = Math.floor(totalMs / 60_000);
  return {
    totalMs,
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
    seconds: Math.floor((totalMs % 60_000) / 1000),
  };
}

/** e.g. "Friday 26 February 2027 at 03:00 GMT", in the visitor's own time zone. */
export function deadlineInLocalTime() {
  return BANK_DEADLINE.toLocaleString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

type Row = Record<string, unknown>;
const NOT_CONFIGURED = 'Supabase is not configured.';

// ---------------------------------------------------------------------------
// Front-page summary
// ---------------------------------------------------------------------------

export interface BankPrepSummary {
  stillToMove: number;
  heldForRibbons: number;
  moved: number;
  activePlans: number;
  lastChanceOpen: number;
}

export async function getBankPrepSummary(): Promise<Result<BankPrepSummary | null>> {
  if (!supabase) return { data: null, error: NOT_CONFIGURED };
  const { data, error } = await supabase.rpc('get_bank_prep_summary');
  if (error) return { data: null, error: cleanError(error.message) };
  const row = (Array.isArray(data) ? data[0] : data) as Row | undefined;
  if (!row) return { data: null, error: null };
  return {
    data: {
      stillToMove: Number(row.still_to_move ?? 0),
      heldForRibbons: Number(row.held_for_ribbons ?? 0),
      moved: Number(row.moved ?? 0),
      activePlans: Number(row.active_plans ?? 0),
      lastChanceOpen: Number(row.last_chance_open ?? 0),
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Still-in-Bank checklist
// ---------------------------------------------------------------------------

export type BankLocation = 'bank' | 'game_3ds' | 'game_ds' | 'game_gba';

export const LOCATION_LABELS: Record<BankLocation, string> = {
  bank: 'In Bank',
  game_3ds: 'In a 3DS game',
  game_ds: 'In a DS game',
  game_gba: 'In a GBA/GameCube game',
};

export interface ChecklistItem {
  id: string;
  label: string;
  formId: number | null;
  shiny: boolean;
  location: BankLocation;
  boxNote: string | null;
  holdForRibbons: boolean;
  movedAt: string | null;
  createdAt: string;
}

const CHECKLIST_COLUMNS = 'id, label, form_id, shiny, location, box_note, hold_for_ribbons, moved_at, created_at';

function toChecklistItem(row: Row): ChecklistItem {
  return {
    id: String(row.id),
    label: String(row.label),
    formId: row.form_id == null ? null : Number(row.form_id),
    shiny: Boolean(row.shiny),
    location: row.location as BankLocation,
    boxNote: (row.box_note as string | null) ?? null,
    holdForRibbons: Boolean(row.hold_for_ribbons),
    movedAt: (row.moved_at as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

export async function getChecklist(): Promise<Result<ChecklistItem[]>> {
  if (!supabase) return { data: [], error: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from('bank_checklist')
    .select(CHECKLIST_COLUMNS)
    .order('created_at', { ascending: true })
    .limit(3000);
  if (error) return { data: [], error: cleanError(error.message) };
  return { data: ((data ?? []) as Row[]).map(toChecklistItem), error: null };
}

export interface NewChecklistItem {
  label: string;
  formId: number | null;
  shiny: boolean;
  location: BankLocation;
  boxNote: string;
  holdForRibbons: boolean;
}

export async function addChecklistItem(userId: string, item: NewChecklistItem): Promise<Result> {
  if (!supabase) return { data: null, error: NOT_CONFIGURED };
  const { error } = await supabase.from('bank_checklist').insert({
    user_id: userId,
    label: item.label.trim().slice(0, 60),
    form_id: item.formId,
    shiny: item.shiny,
    location: item.location,
    box_note: item.boxNote.trim().slice(0, 80) || null,
    hold_for_ribbons: item.holdForRibbons,
  });
  return { data: null, error: cleanError(error?.message) };
}

export async function updateChecklistItem(
  id: string,
  changes: Partial<{ holdForRibbons: boolean; moved: boolean; location: BankLocation; boxNote: string }>,
): Promise<Result> {
  if (!supabase) return { data: null, error: NOT_CONFIGURED };
  const patch: Row = {};
  if (changes.holdForRibbons !== undefined) patch.hold_for_ribbons = changes.holdForRibbons;
  if (changes.moved !== undefined) patch.moved_at = changes.moved ? new Date().toISOString() : null;
  if (changes.location !== undefined) patch.location = changes.location;
  if (changes.boxNote !== undefined) patch.box_note = changes.boxNote.trim().slice(0, 80) || null;
  const { error } = await supabase.from('bank_checklist').update(patch).eq('id', id);
  return { data: null, error: cleanError(error?.message) };
}

export async function removeChecklistItem(id: string): Promise<Result> {
  if (!supabase) return { data: null, error: NOT_CONFIGURED };
  const { error } = await supabase.from('bank_checklist').delete().eq('id', id);
  return { data: null, error: cleanError(error?.message) };
}

// ---------------------------------------------------------------------------
// Ribbon Master plans
// ---------------------------------------------------------------------------

export interface RibbonPlan {
  id: string;
  label: string;
  formId: number | null;
  shiny: boolean;
  origin: RibbonOrigin;
  currentStage: RibbonStage;
  completedRibbons: string[];
  skippedRibbons: string[];
  notes: string | null;
  createdAt: string;
}

const PLAN_COLUMNS = 'id, label, form_id, shiny, origin, current_stage, completed_ribbons, skipped_ribbons, notes, created_at';

function toPlan(row: Row): RibbonPlan {
  return {
    id: String(row.id),
    label: String(row.label),
    formId: row.form_id == null ? null : Number(row.form_id),
    shiny: Boolean(row.shiny),
    origin: row.origin as RibbonOrigin,
    currentStage: row.current_stage as RibbonStage,
    completedRibbons: (row.completed_ribbons as string[] | null) ?? [],
    skippedRibbons: (row.skipped_ribbons as string[] | null) ?? [],
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

export async function getRibbonPlans(): Promise<Result<RibbonPlan[]>> {
  if (!supabase) return { data: [], error: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from('ribbon_plans')
    .select(PLAN_COLUMNS)
    .order('created_at', { ascending: true });
  if (error) return { data: [], error: cleanError(error.message) };
  return { data: ((data ?? []) as Row[]).map(toPlan), error: null };
}

export async function addRibbonPlan(
  userId: string,
  plan: { label: string; formId: number | null; shiny: boolean; origin: RibbonOrigin; stage: RibbonStage },
): Promise<Result> {
  if (!supabase) return { data: null, error: NOT_CONFIGURED };
  const { error } = await supabase.from('ribbon_plans').insert({
    user_id: userId,
    label: plan.label.trim().slice(0, 60),
    form_id: plan.formId,
    shiny: plan.shiny,
    origin: plan.origin,
    current_stage: plan.stage,
  });
  return { data: null, error: cleanError(error?.message) };
}

export async function updateRibbonPlan(
  id: string,
  changes: Partial<{ currentStage: RibbonStage; completedRibbons: string[]; skippedRibbons: string[]; notes: string }>,
): Promise<Result> {
  if (!supabase) return { data: null, error: NOT_CONFIGURED };
  const patch: Row = {};
  if (changes.currentStage !== undefined) patch.current_stage = changes.currentStage;
  if (changes.completedRibbons !== undefined) patch.completed_ribbons = changes.completedRibbons;
  if (changes.skippedRibbons !== undefined) patch.skipped_ribbons = changes.skippedRibbons;
  if (changes.notes !== undefined) patch.notes = changes.notes.trim().slice(0, 500) || null;
  const { error } = await supabase.from('ribbon_plans').update(patch).eq('id', id);
  return { data: null, error: cleanError(error?.message) };
}

export async function removeRibbonPlan(id: string): Promise<Result> {
  if (!supabase) return { data: null, error: NOT_CONFIGURED };
  const { error } = await supabase.from('ribbon_plans').delete().eq('id', id);
  return { data: null, error: cleanError(error?.message) };
}

// ---------------------------------------------------------------------------
// Last-chance list
// ---------------------------------------------------------------------------

export type LastChanceCategory = 'origin' | 'ribbon' | 'event' | 'form' | 'other';

export const LAST_CHANCE_CATEGORIES: Array<{ id: LastChanceCategory; label: string }> = [
  { id: 'origin', label: 'Origin and marks' },
  { id: 'ribbon', label: 'Ribbons' },
  { id: 'event', label: 'Events' },
  { id: 'form', label: 'Forms and specific Pokémon' },
  { id: 'other', label: 'Everything else' },
];

export interface LastChanceEntry {
  id: number;
  slug: string;
  title: string;
  category: LastChanceCategory;
  description: string;
  speciesId: number | null;
  formId: number | null;
  sourceUrl: string | null;
  sortOrder: number;
  isPublished: boolean;
}

const LAST_CHANCE_COLUMNS = 'id, slug, title, category, description, species_id, form_id, source_url, sort_order, is_published';

function toLastChance(row: Row): LastChanceEntry {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    title: String(row.title),
    category: row.category as LastChanceCategory,
    description: String(row.description ?? ''),
    speciesId: row.species_id == null ? null : Number(row.species_id),
    formId: row.form_id == null ? null : Number(row.form_id),
    sourceUrl: (row.source_url as string | null) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    isPublished: Boolean(row.is_published),
  };
}

/** Published entries for everyone; admins also get their hidden drafts. */
export async function getLastChanceList(): Promise<Result<LastChanceEntry[]>> {
  if (!supabase) return { data: [], error: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from('bank_last_chance')
    .select(LAST_CHANCE_COLUMNS)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (error) return { data: [], error: cleanError(error.message) };
  return { data: ((data ?? []) as Row[]).map(toLastChance), error: null };
}

/** Entries tied to one Pokémon, for the badge on its page. */
export async function getLastChanceForPokemon(speciesId: number, formIds: number[]): Promise<Result<LastChanceEntry[]>> {
  if (!supabase) return { data: [], error: NOT_CONFIGURED };
  const filters = [`species_id.eq.${speciesId}`];
  if (formIds.length) filters.push(`form_id.in.(${formIds.join(',')})`);
  const { data, error } = await supabase
    .from('bank_last_chance')
    .select(LAST_CHANCE_COLUMNS)
    .eq('is_published', true)
    .or(filters.join(','))
    .order('sort_order', { ascending: true });
  if (error) return { data: [], error: cleanError(error.message) };
  return { data: ((data ?? []) as Row[]).map(toLastChance), error: null };
}

export async function getMyLastChanceTicks(): Promise<Result<Set<number>>> {
  if (!supabase) return { data: new Set(), error: NOT_CONFIGURED };
  const { data, error } = await supabase.from('bank_last_chance_done').select('entry_id');
  if (error) return { data: new Set(), error: cleanError(error.message) };
  return { data: new Set(((data ?? []) as Row[]).map((row) => Number(row.entry_id))), error: null };
}

export async function setLastChanceTick(userId: string, entryId: number, done: boolean): Promise<Result> {
  if (!supabase) return { data: null, error: NOT_CONFIGURED };
  const { error } = done
    ? await supabase.from('bank_last_chance_done').upsert({ user_id: userId, entry_id: entryId }, { onConflict: 'user_id,entry_id', ignoreDuplicates: true })
    : await supabase.from('bank_last_chance_done').delete().eq('user_id', userId).eq('entry_id', entryId);
  return { data: null, error: cleanError(error?.message) };
}

// Admin editing. The database refuses all of these for non-admins.

export interface LastChanceDraft {
  slug: string;
  title: string;
  category: LastChanceCategory;
  description: string;
  formId: number | null;
  speciesId: number | null;
  sourceUrl: string;
  sortOrder: number;
  isPublished: boolean;
}

function draftToRow(draft: LastChanceDraft): Row {
  return {
    slug: draft.slug.trim(),
    title: draft.title.trim(),
    category: draft.category,
    description: draft.description.trim(),
    form_id: draft.formId,
    species_id: draft.speciesId,
    source_url: draft.sourceUrl.trim() || null,
    sort_order: draft.sortOrder,
    is_published: draft.isPublished,
  };
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function saveLastChanceEntry(id: number | null, draft: LastChanceDraft): Promise<Result> {
  if (!supabase) return { data: null, error: NOT_CONFIGURED };
  const row = draftToRow(draft);
  const { error } = id == null
    ? await supabase.from('bank_last_chance').insert(row)
    : await supabase.from('bank_last_chance').update(row).eq('id', id);
  return { data: null, error: cleanError(error?.message) };
}

export async function deleteLastChanceEntry(id: number): Promise<Result> {
  if (!supabase) return { data: null, error: NOT_CONFIGURED };
  const { error } = await supabase.from('bank_last_chance').delete().eq('id', id);
  return { data: null, error: cleanError(error?.message) };
}
