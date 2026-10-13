import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { CollectionGoal, CollectionPresetId, UserProfile } from '../types';

const BACKUP_FORMAT = 'devidex-backup';
const CURRENT_BACKUP_VERSION = 4;
const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const MAX_NATIONAL_ROWS = 10_000;
const MAX_GAME_ROWS = 50_000;
const MAX_COLLECTION_VIEWS = 20;
const MAX_GAME_FORM_ROWS = 50_000;

type NationalBackupRowV1 = {
  form_id: number;
  normal_owned: boolean;
  shiny_owned: boolean;
  notes: string | null;
};

type GameBackupRowV1 = {
  game_id: number;
  species_id: number;
  normal_owned: boolean;
  shiny_owned: boolean;
  notes: string | null;
};

type DeviDexBackupV1 = {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exported_at: string;
  account?: Record<string, unknown>;
  national_progress: NationalBackupRowV1[];
  game_progress: GameBackupRowV1[];
};

/** v2 introduced portable catalogue slugs instead of database IDs. */
export type NationalBackupRowV2 = {
  form_slug: string;
  normal_owned: boolean;
  shiny_owned: boolean;
  notes: string | null;
};

export type GameBackupRowV2 = {
  game_slug: string;
  species_slug: string;
  normal_owned: boolean;
  shiny_owned: boolean;
  notes: string | null;
};

type BackupAccountHint = {
  username: string | null;
};

export type DeviDexBackupV2 = {
  format: typeof BACKUP_FORMAT;
  version: 2;
  exported_at: string;
  created_with: string;
  account_hint: BackupAccountHint;
  national_progress: NationalBackupRowV2[];
  game_progress: GameBackupRowV2[];
};

/** v3 adds Phase 5's named collection definitions to the portable backup. */
export type CollectionViewBackupRowV3 = {
  name: string;
  preset_id: CollectionPresetId;
  goal: CollectionGoal;
  include_regional: boolean;
  include_alternate: boolean;
  include_pattern: boolean;
  include_gender: boolean;
  include_battle: boolean;
  include_special: boolean;
  is_active: boolean;
};

export type DeviDexBackupV3 = {
  format: typeof BACKUP_FORMAT;
  version: 3;
  exported_at: string;
  created_with: string;
  account_hint: BackupAccountHint;
  national_progress: NationalBackupRowV2[];
  game_progress: GameBackupRowV2[];
  collection_views: CollectionViewBackupRowV3[];
};

/** v4 adds optional-form progress inside individual Game Dexes. */
export type GameFormBackupRowV4 = {
  game_slug: string;
  form_slug: string;
  normal_owned: boolean;
  shiny_owned: boolean;
  notes: string | null;
};

export type DeviDexBackupV4 = {
  format: typeof BACKUP_FORMAT;
  version: 4;
  exported_at: string;
  created_with: string;
  account_hint: BackupAccountHint;
  national_progress: NationalBackupRowV2[];
  game_progress: GameBackupRowV2[];
  game_form_progress: GameFormBackupRowV4[];
  collection_views: CollectionViewBackupRowV3[];
};

type AnyDeviDexBackup = DeviDexBackupV1 | DeviDexBackupV2 | DeviDexBackupV3 | DeviDexBackupV4;

type ExportRpcPayloadV4 = {
  national_progress?: NationalBackupRowV2[];
  game_progress?: GameBackupRowV2[];
  game_form_progress?: GameFormBackupRowV4[];
  collection_views?: CollectionViewBackupRowV3[];
};

export type BackupPreview = {
  version: 1 | 2 | 3 | 4;
  exportedAt: string;
  username: string | null;
  nationalRows: number;
  gameRows: number;
  gameFormRows: number;
  collectionViews: number;
  legacy: boolean;
};

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
}

function validNotes(value: unknown) {
  return value == null || (typeof value === 'string' && value.length <= 10_000);
}

function validExportDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validateProgressV2(
  nationalProgress: NationalBackupRowV2[] | undefined,
  gameProgress: GameBackupRowV2[] | undefined,
) {
  if (!Array.isArray(nationalProgress) || !Array.isArray(gameProgress)) {
    throw new Error('The backup is missing collection progress arrays.');
  }

  if (nationalProgress.length > MAX_NATIONAL_ROWS || gameProgress.length > MAX_GAME_ROWS) {
    throw new Error('That backup contains an unreasonable number of rows and was rejected.');
  }

  const nationalKeys = new Set<string>();
  const gameKeys = new Set<string>();

  const nationalOk = nationalProgress.every((row) => {
    if (!isNonEmptyString(row?.form_slug)
      || !isBoolean(row?.normal_owned)
      || !isBoolean(row?.shiny_owned)
      || !validNotes(row?.notes)) return false;

    const key = row.form_slug.trim().toLowerCase();
    if (nationalKeys.has(key)) return false;
    nationalKeys.add(key);
    return true;
  });

  const gameOk = gameProgress.every((row) => {
    if (!isNonEmptyString(row?.game_slug)
      || !isNonEmptyString(row?.species_slug)
      || !isBoolean(row?.normal_owned)
      || !isBoolean(row?.shiny_owned)
      || !validNotes(row?.notes)) return false;

    const key = `${row.game_slug.trim().toLowerCase()}::${row.species_slug.trim().toLowerCase()}`;
    if (gameKeys.has(key)) return false;
    gameKeys.add(key);
    return true;
  });

  if (!nationalOk || !gameOk) throw new Error('The backup contains invalid or duplicate collection rows.');
}

function validateV1(backup: Partial<DeviDexBackupV1>): DeviDexBackupV1 {
  if (!validExportDate(backup.exported_at)) throw new Error('The backup has an invalid export date.');
  if (!Array.isArray(backup.national_progress) || !Array.isArray(backup.game_progress)) {
    throw new Error('The backup is missing collection progress arrays.');
  }

  if (backup.national_progress.length > MAX_NATIONAL_ROWS || backup.game_progress.length > MAX_GAME_ROWS) {
    throw new Error('That backup contains an unreasonable number of rows and was rejected.');
  }

  const nationalOk = backup.national_progress.every((row) =>
    Number.isInteger(row?.form_id)
      && isBoolean(row?.normal_owned)
      && isBoolean(row?.shiny_owned)
      && validNotes(row?.notes),
  );
  const gameOk = backup.game_progress.every((row) =>
    Number.isInteger(row?.game_id)
      && Number.isInteger(row?.species_id)
      && isBoolean(row?.normal_owned)
      && isBoolean(row?.shiny_owned)
      && validNotes(row?.notes),
  );

  if (!nationalOk || !gameOk) throw new Error('The legacy backup contains invalid collection rows.');
  return backup as DeviDexBackupV1;
}

function validateV2(backup: Partial<DeviDexBackupV2>): DeviDexBackupV2 {
  if (!validExportDate(backup.exported_at)) throw new Error('The backup has an invalid export date.');
  validateProgressV2(backup.national_progress, backup.game_progress);
  return backup as DeviDexBackupV2;
}

const validPresetIds: CollectionPresetId[] = ['standard', 'forms', 'gender-forms', 'shiny', 'shiny-forms', 'battle-forms', 'everything', 'custom'];
const validGoals: CollectionGoal[] = ['living', 'shiny', 'both'];

function validateV3(backup: Partial<DeviDexBackupV3>): DeviDexBackupV3 {
  if (!validExportDate(backup.exported_at)) throw new Error('The backup has an invalid export date.');
  validateProgressV2(backup.national_progress, backup.game_progress);

  if (!Array.isArray(backup.collection_views)
    || backup.collection_views.length < 1
    || backup.collection_views.length > MAX_COLLECTION_VIEWS) {
    throw new Error('The backup has an invalid number of saved collection setups.');
  }

  const names = new Set<string>();
  let activeCount = 0;

  const viewsOk = backup.collection_views.every((row) => {
    if (!isNonEmptyString(row?.name)
      || row.name.trim().length > 40
      || !validPresetIds.includes(row?.preset_id)
      || !validGoals.includes(row?.goal)
      || !isBoolean(row?.include_regional)
      || !isBoolean(row?.include_alternate)
      || !isBoolean(row?.include_pattern)
      || !isBoolean(row?.include_gender)
      || !isBoolean(row?.include_battle)
      || !isBoolean(row?.include_special)
      || !isBoolean(row?.is_active)) return false;

    const key = row.name.trim().toLowerCase();
    if (names.has(key)) return false;
    names.add(key);
    if (row.is_active) activeCount += 1;
    return true;
  });

  if (!viewsOk || activeCount !== 1) {
    throw new Error('The backup contains invalid, duplicate, or ambiguous saved collection setups.');
  }

  return backup as DeviDexBackupV3;
}


function validateV4(backup: Partial<DeviDexBackupV4>): DeviDexBackupV4 {
  if (!validExportDate(backup.exported_at)) throw new Error('The backup has an invalid export date.');
  validateProgressV2(backup.national_progress, backup.game_progress);

  // Reuse the v3 saved-collection validator by presenting the common portion
  // as a v3-shaped object. The actual v4 object is returned unchanged below.
  validateV3({
    ...(backup as DeviDexBackupV4),
    version: 3,
  });

  if (!Array.isArray(backup.game_form_progress) || backup.game_form_progress.length > MAX_GAME_FORM_ROWS) {
    throw new Error('The backup has an invalid number of Game Dex form rows.');
  }

  const keys = new Set<string>();
  const rowsOk = backup.game_form_progress.every((row) => {
    if (!isNonEmptyString(row?.game_slug)
      || !isNonEmptyString(row?.form_slug)
      || !isBoolean(row?.normal_owned)
      || !isBoolean(row?.shiny_owned)
      || !validNotes(row?.notes)) return false;

    const key = `${row.game_slug.trim().toLowerCase()}::${row.form_slug.trim().toLowerCase()}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });

  if (!rowsOk) throw new Error('The backup contains invalid or duplicate Game Dex form rows.');
  return backup as DeviDexBackupV4;
}

function validateBackup(raw: unknown): AnyDeviDexBackup {
  if (!raw || typeof raw !== 'object') throw new Error('That file is not a DeviDex backup.');
  const backup = raw as Partial<AnyDeviDexBackup>;

  if (backup.format !== BACKUP_FORMAT) throw new Error('That file is not a DeviDex backup.');
  if (backup.version === 1) return validateV1(backup as Partial<DeviDexBackupV1>);
  if (backup.version === 2) return validateV2(backup as Partial<DeviDexBackupV2>);
  if (backup.version === 3) return validateV3(backup as Partial<DeviDexBackupV3>);
  if (backup.version === CURRENT_BACKUP_VERSION) return validateV4(backup as Partial<DeviDexBackupV4>);

  throw new Error('That backup version is not supported by this DeviDex build.');
}

async function parseBackupFile(file: File) {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('That backup is larger than 10 MB and was rejected.');

  let raw: unknown;
  try {
    raw = JSON.parse(await file.text()) as unknown;
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  return validateBackup(raw);
}

/**
 * v4 keeps all stable-slug progress and adds per-game optional-form rows.
 * Email, HOME code and privacy settings remain deliberately excluded.
 */
export async function buildAccountBackup(user: User, profile: UserProfile | null): Promise<DeviDexBackupV4> {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (!user.id) throw new Error('You must be signed in to create a backup.');

  const { data, error } = await supabase.rpc('export_own_collection_v4');
  if (error) throw new Error(error.message);

  const payload = (data ?? {}) as ExportRpcPayloadV4;
  const backup: DeviDexBackupV4 = {
    format: BACKUP_FORMAT,
    version: CURRENT_BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    created_with: 'DeviDex v1.2',
    account_hint: {
      username: profile?.username ?? null,
    },
    national_progress: payload.national_progress ?? [],
    game_progress: payload.game_progress ?? [],
    game_form_progress: payload.game_form_progress ?? [],
    collection_views: payload.collection_views ?? [],
  };

  return validateV4(backup);
}

function downloadText(filename: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function dateStamp() {
  return new Date().toISOString().replaceAll(':', '-').slice(0, 19);
}

export async function downloadJsonBackup(
  user: User,
  profile: UserProfile | null,
  filenamePrefix = 'devidex-backup',
) {
  const backup = await buildAccountBackup(user, profile);
  downloadText(
    `${filenamePrefix}-${dateStamp()}.json`,
    JSON.stringify(backup, null, 2),
    'application/json;charset=utf-8',
  );
}

/** CSV remains a readable progress export; JSON is the restorable full backup. */
export async function downloadCsvBackup(user: User, profile: UserProfile | null) {
  const backup = await buildAccountBackup(user, profile);

  const escapeCell = (value: unknown) => {
    const text = value == null ? '' : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  };

  const lines = [
    ['scope', 'game_slug', 'pokemon_key', 'normal_owned', 'shiny_owned', 'notes', 'collection_name', 'preset', 'goal', 'active', 'regional', 'alternate', 'pattern', 'gender', 'battle', 'special'].map(escapeCell).join(','),
    ...backup.national_progress.map((row) => [
      'national', '', row.form_slug, row.normal_owned, row.shiny_owned, row.notes ?? '', '', '', '', '', '', '', '', '', '', '',
    ].map(escapeCell).join(',')),
    ...backup.game_progress.map((row) => [
      'game', row.game_slug, row.species_slug, row.normal_owned, row.shiny_owned, row.notes ?? '', '', '', '', '', '', '', '', '', '', '',
    ].map(escapeCell).join(',')),
    ...backup.game_form_progress.map((row) => [
      'game_form', row.game_slug, row.form_slug, row.normal_owned, row.shiny_owned, row.notes ?? '', '', '', '', '', '', '', '', '', '', '',
    ].map(escapeCell).join(',')),
    ...backup.collection_views.map((row) => [
      'collection_view', '', '', '', '', '', row.name, row.preset_id, row.goal, row.is_active, row.include_regional, row.include_alternate, row.include_pattern, row.include_gender, row.include_battle, row.include_special,
    ].map(escapeCell).join(',')),
  ];

  downloadText(`devidex-progress-${dateStamp()}.csv`, lines.join('\n'), 'text/csv;charset=utf-8');
}

export async function inspectBackupFile(file: File): Promise<BackupPreview> {
  const backup = await parseBackupFile(file);
  const username = backup.version === 1
    ? typeof backup.account?.username === 'string' ? backup.account.username : null
    : backup.account_hint?.username ?? null;

  return {
    version: backup.version,
    exportedAt: backup.exported_at,
    username,
    nationalRows: backup.national_progress.length,
    gameRows: backup.game_progress.length,
    gameFormRows: backup.version === 4 ? backup.game_form_progress.length : 0,
    collectionViews: backup.version === 3 || backup.version === 4 ? backup.collection_views.length : 0,
    legacy: backup.version === 1,
  };
}

/**
 * Merge never erases existing Owned/Shiny ticks. For v3 saved setups it also
 * never overwrites a same-named local setup or silently changes the active one.
 * Replace reproduces the selected backup and remains transactional in SQL.
 */
export async function restoreBackup(file: File, userId: string, mode: 'merge' | 'replace') {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (!userId) throw new Error('You must be signed in to restore a backup.');

  const backup = await parseBackupFile(file);

  if (backup.version === 1) {
    const { data, error } = await supabase.rpc('restore_own_collection', {
      national_rows: backup.national_progress,
      game_rows: backup.game_progress,
      replace_existing: mode === 'replace',
    });
    if (error) throw new Error(error.message);
    const first = Array.isArray(data) ? data[0] : data;
    return {
      nationalRows: Number(first?.national_count ?? backup.national_progress.length),
      gameRows: Number(first?.game_count ?? backup.game_progress.length),
      gameFormRows: 0,
      collectionRows: 0,
      version: 1 as const,
    };
  }

  if (backup.version === 2) {
    const { data, error } = await supabase.rpc('restore_own_collection_v2', {
      national_rows: backup.national_progress,
      game_rows: backup.game_progress,
      replace_existing: mode === 'replace',
    });
    if (error) throw new Error(error.message);
    const first = Array.isArray(data) ? data[0] : data;
    return {
      nationalRows: Number(first?.national_count ?? backup.national_progress.length),
      gameRows: Number(first?.game_count ?? backup.game_progress.length),
      gameFormRows: 0,
      collectionRows: 0,
      version: 2 as const,
    };
  }

  if (backup.version === 3) {
    const { data, error } = await supabase.rpc('restore_own_collection_v3', {
      national_rows: backup.national_progress,
      game_rows: backup.game_progress,
      collection_rows: backup.collection_views,
      replace_existing: mode === 'replace',
    });
    if (error) throw new Error(error.message);
    const first = Array.isArray(data) ? data[0] : data;
    return {
      nationalRows: Number(first?.national_count ?? backup.national_progress.length),
      gameRows: Number(first?.game_count ?? backup.game_progress.length),
      gameFormRows: 0,
      collectionRows: Number(first?.collection_count ?? backup.collection_views.length),
      version: 3 as const,
    };
  }

  const { data, error } = await supabase.rpc('restore_own_collection_v4', {
    national_rows: backup.national_progress,
    game_rows: backup.game_progress,
    game_form_rows: backup.game_form_progress,
    collection_rows: backup.collection_views,
    replace_existing: mode === 'replace',
  });
  if (error) throw new Error(error.message);
  const first = Array.isArray(data) ? data[0] : data;

  return {
    nationalRows: Number(first?.national_count ?? backup.national_progress.length),
    gameRows: Number(first?.game_count ?? backup.game_progress.length),
    gameFormRows: Number(first?.game_form_count ?? backup.game_form_progress.length),
    collectionRows: Number(first?.collection_count ?? backup.collection_views.length),
    version: 4 as const,
  };
}
