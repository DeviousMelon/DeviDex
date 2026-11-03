import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  REFERENCE_CSV_FILES,
  REFERENCE_PRIMARY_KEYS,
  REFERENCE_TABLE_ORDER,
  buildReferenceRows,
  referenceCsvUrl,
  type ReferenceCsvTexts,
  type ReferenceRows,
} from '../lib/referenceData';

type ReferenceCounts = {
  types: number;
  moves: number;
  abilities: number;
  items: number;
  pokemon: number;
  learnsets: number;
};

const emptyCounts: ReferenceCounts = { types: 0, moves: 0, abilities: 0, items: 0, pokemon: 0, learnsets: 0 };

// Tables where a re-sync should drop rows PokéAPI no longer has, not just
// update the ones it still has. A corrected learnset level, for example,
// would otherwise leave the old level behind as a second row.
const REPLACED_TABLES = new Set<keyof ReferenceRows>(['ref_type_efficacy_past', 'ref_pokemon_types_past', 'ref_pokemon_moves']);

const PAGE = 1000;

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function fetchCsvTexts(onProgress: (done: number, total: number) => void): Promise<ReferenceCsvTexts> {
  const texts: Partial<ReferenceCsvTexts> = {};
  let done = 0;
  for (const batch of chunks([...REFERENCE_CSV_FILES], 6)) {
    await Promise.all(batch.map(async (name) => {
      const response = await fetch(referenceCsvUrl(name));
      if (!response.ok) throw new Error(`Could not read ${name}.csv from PokéAPI (HTTP ${response.status}).`);
      texts[name] = await response.text();
      done += 1;
      onProgress(done, REFERENCE_CSV_FILES.length);
    }));
  }
  return texts as ReferenceCsvTexts;
}

/** Reads one id column in pages, since the API returns at most 1,000 rows per request. */
async function readAllIds(table: string, column: string) {
  if (!supabase) return [];
  const ids: number[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(column).order(column).range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as Array<Record<string, number>>;
    ids.push(...page.map((row) => row[column]));
    if (page.length < PAGE) break;
  }
  return ids;
}

export function AdminReferenceData() {
  const [counts, setCounts] = useState<ReferenceCounts>(emptyCounts);
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function loadCounts() {
    if (!supabase) return;
    setLoadingCounts(true);
    const count = (table: string) => supabase!.from(table).select('*', { count: 'exact', head: true });
    const [types, moves, abilities, items, pokemon, learnsets] = await Promise.all([
      count('ref_types'), count('ref_moves'), count('ref_abilities'),
      count('ref_items'), count('ref_pokemon'), count('ref_pokemon_moves'),
    ]);
    setCounts({
      types: types.count ?? 0,
      moves: moves.count ?? 0,
      abilities: abilities.count ?? 0,
      items: items.count ?? 0,
      pokemon: pokemon.count ?? 0,
      learnsets: learnsets.count ?? 0,
    });
    setLoadingCounts(false);
  }

  useEffect(() => {
    void loadCounts();
  }, []);

  async function clearTable(table: keyof ReferenceRows) {
    if (!supabase) return;
    if (table === 'ref_pokemon_moves') {
      // ~160k rows: delete a few dozen Pokémon at a time so no single request
      // runs into the database's statement timeout.
      const pokemonIds = await readAllIds('ref_pokemon', 'id');
      for (const [index, batch] of chunks(pokemonIds, 40).entries()) {
        setProgress(`Clearing old learnsets ${index + 1} / ${Math.ceil(pokemonIds.length / 40)}…`);
        const { error } = await supabase.from(table).delete().in('pokemon_id', batch);
        if (error) throw error;
      }
      return;
    }
    const firstKey = REFERENCE_PRIMARY_KEYS[table].split(',')[0];
    const { error } = await supabase.from(table).delete().gt(firstKey, 0);
    if (error) throw error;
  }

  async function importReferenceData() {
    if (!supabase || importing) return;
    setImporting(true);
    setMessage(null);

    try {
      setProgress('Reading the National Dex already in DeviDex…');
      const speciesIds = new Set(await readAllIds('pokemon_species', 'id'));
      if (speciesIds.size === 0) throw new Error('Import the National Dex first.');

      const csv = await fetchCsvTexts((done, total) => setProgress(`Downloading PokéAPI data ${done} / ${total} (the learnset file is about 10 MB)…`));

      setProgress('Folding learnsets and matching everything up…');
      const rows = buildReferenceRows(csv, speciesIds);

      for (const table of REFERENCE_TABLE_ORDER) {
        if (REPLACED_TABLES.has(table)) await clearTable(table);

        const tableRows = rows[table] as object[];
        const size = table === 'ref_pokemon_moves' ? 1000 : 500;
        const label = table.replace('ref_', '').replaceAll('_', ' ');
        for (const [index, batch] of chunks(tableRows, size).entries()) {
          setProgress(`Saving ${label} ${index + 1} / ${Math.ceil(tableRows.length / size)}…`);
          const { error } = await supabase.from(table).upsert(batch, { onConflict: REFERENCE_PRIMARY_KEYS[table] });
          if (error) throw new Error(`${label}: ${error.message}`);
        }
      }

      setMessage(
        `Imported ${rows.ref_types.length} types, ${rows.ref_moves.length.toLocaleString()} moves, `
        + `${rows.ref_abilities.length} abilities, ${rows.ref_items.length.toLocaleString()} items, `
        + `${rows.ref_pokemon.length.toLocaleString()} Pokémon and ${rows.ref_pokemon_moves.length.toLocaleString()} learnset rows.`,
      );
      setProgress('');
      await loadCounts();
    } catch (error) {
      setMessage(`Reference data import failed: ${error instanceof Error ? error.message : 'Unknown import error.'}`);
      setProgress('');
    } finally {
      setImporting(false);
    }
  }

  const show = (value: number) => (loadingCounts ? '…' : value.toLocaleString());

  return (
    <section className="section admin-section admin-data-tools">
      <div className="section-heading">
        <div>
          <h2>Reference data</h2>
          <p className="muted">
            Types, moves, abilities, items, natures, catch rates, egg groups, base stats and learnsets.
            The calculators and search tools read from here. Nobody's saves are touched.
          </p>
        </div>
        <button className="button button--secondary" type="button" onClick={() => void loadCounts()}>
          Refresh counts
        </button>
      </div>

      <div className="admin-data-counts admin-data-counts--six">
        <article><span>Types</span><strong>{show(counts.types)}</strong></article>
        <article><span>Moves</span><strong>{show(counts.moves)}</strong></article>
        <article><span>Abilities</span><strong>{show(counts.abilities)}</strong></article>
        <article><span>Items</span><strong>{show(counts.items)}</strong></article>
        <article><span>Pokémon</span><strong>{show(counts.pokemon)}</strong></article>
        <article><span>Learnset rows</span><strong>{show(counts.learnsets)}</strong></article>
      </div>

      <div className="admin-import-card">
        <div>
          <span className="admin-import-card__mark">⚙</span>
          <div>
            <h3>Reference data importer</h3>
            <p>
              Syncs everything from PokéAPI in one go. Re-run it after a new game or DLC lands
              (and after re-syncing the National Dex). Takes a minute or two.
            </p>
          </div>
        </div>
        <button className="button button--primary" type="button" disabled={importing} onClick={() => void importReferenceData()}>
          {importing ? 'Importing…' : counts.pokemon ? 'Re-sync reference data' : 'Import reference data'}
        </button>
      </div>

      {progress && <p className="admin-import-progress">{progress}</p>}
      {message && <p className="admin-import-message">{message}</p>}
    </section>
  );
}
