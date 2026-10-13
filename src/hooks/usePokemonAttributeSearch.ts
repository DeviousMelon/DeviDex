import { useEffect, useMemo, useState } from 'react';
import { fetchPokeApiJson, humanizeApiName, type NamedApiResource } from '../lib/pokeapi';

export type PokemonSearchMode = 'pokemon' | 'type' | 'move';

type TypeSearchResponse = { pokemon: Array<{ pokemon: NamedApiResource }> };
type MoveSearchResponse = { learned_by_pokemon: NamedApiResource[] };
type MoveListResponse = { results: NamedApiResource[] };

/** Everything that matched: PokéAPI Pokémon names plus National Dex numbers. */
export interface AttributeMatches {
  names: Set<string>;
  /** Default varieties (PokéAPI ids below 10000 equal the National Dex number). */
  dexNumbers: Set<number>;
  has: (slug: string) => boolean;
}

export const POKEMON_TYPES = [
  'normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];

const resultCache = new Map<string, AttributeMatches>();
let moveListPromise: Promise<string[]> | null = null;

function apiSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function idFromUrl(url: string) {
  const match = url.match(/\/(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}

function buildMatches(resources: NamedApiResource[]): AttributeMatches {
  const names = new Set(resources.map((resource) => resource.name));
  const dexNumbers = new Set<number>();
  for (const resource of resources) {
    const id = idFromUrl(resource.url);
    if (id != null && id < 10000) dexNumbers.add(id);
  }
  return { names, dexNumbers, has: (slug) => names.has(slug) };
}

/** All move names, fetched once per visit, for suggestions and partial typing. */
function loadMoveList() {
  if (!moveListPromise) {
    moveListPromise = fetchPokeApiJson<MoveListResponse>('https://pokeapi.co/api/v2/move?limit=2000')
      .then((result) => result.results.map((move) => move.name))
      .catch((error) => {
        moveListPromise = null;
        throw error;
      });
  }
  return moveListPromise;
}

/** Suggestions for the search box: move names or type names, human-readable. */
export function useAttributeOptions(mode: PokemonSearchMode) {
  const [moves, setMoves] = useState<string[]>([]);

  useEffect(() => {
    if (mode !== 'move') return;
    let active = true;
    loadMoveList().then((list) => { if (active) setMoves(list); }).catch(() => undefined);
    return () => { active = false; };
  }, [mode]);

  return useMemo(() => {
    if (mode === 'type') return POKEMON_TYPES.map(humanizeApiName);
    if (mode === 'move') return moves.map(humanizeApiName);
    return [];
  }, [mode, moves]);
}

/**
 * Resolves what the person typed to one move or type. Exact names win; if the
 * text is the start of exactly one move ("ice be" → ice-beam) that is used too.
 */
function resolveSlug(mode: 'type' | 'move', typed: string, moveList: string[] | null) {
  const slug = apiSlug(typed);
  if (!slug) return { slug: null, hint: null };
  const options = mode === 'type' ? POKEMON_TYPES : moveList;
  if (!options) return { slug, hint: null }; // list not loaded yet: try it as typed
  if (options.includes(slug)) return { slug, hint: null };
  const starts = options.filter((option) => option.startsWith(slug));
  if (starts.length === 1) return { slug: starts[0], hint: null };
  if (starts.length > 1) return { slug: null, hint: `Keep typing: ${starts.length} ${mode === 'type' ? 'types' : 'moves'} start with “${typed.trim()}”.` };
  return { slug: null, hint: `No ${mode} called “${typed.trim()}”.` };
}

export function usePokemonAttributeSearch(mode: PokemonSearchMode, query: string) {
  const [moveList, setMoveList] = useState<string[] | null>(null);
  const [matches, setMatches] = useState<AttributeMatches | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'move') return;
    let active = true;
    loadMoveList().then((list) => { if (active) setMoveList(list); }).catch(() => undefined);
    return () => { active = false; };
  }, [mode]);

  useEffect(() => {
    if (mode === 'pokemon' || !query.trim()) {
      setMatches(null);
      setLoading(false);
      setError(null);
      setResolved(null);
      return;
    }

    const { slug, hint } = resolveSlug(mode, query, mode === 'move' ? moveList : null);
    setResolved(slug);
    if (!slug) {
      setMatches(null);
      setLoading(false);
      setError(hint);
      return;
    }

    const cacheKey = `${mode}:${slug}`;
    const cached = resultCache.get(cacheKey);
    if (cached) {
      setMatches(cached);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const resources = mode === 'type'
          ? (await fetchPokeApiJson<TypeSearchResponse>(`https://pokeapi.co/api/v2/type/${slug}/`, controller.signal)).pokemon.map((row) => row.pokemon)
          : (await fetchPokeApiJson<MoveSearchResponse>(`https://pokeapi.co/api/v2/move/${slug}/`, controller.signal)).learned_by_pokemon;
        if (controller.signal.aborted) return;
        const built = buildMatches(resources);
        resultCache.set(cacheKey, built);
        setMatches(built);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setMatches(null);
        setError(loadError instanceof Error && loadError.message.includes('404')
          ? `No ${mode} called “${query.trim()}”.`
          : "Couldn't reach PokéAPI. Check your connection and try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [mode, query, moveList]);

  return { matches, loading, error, resolved };
}
