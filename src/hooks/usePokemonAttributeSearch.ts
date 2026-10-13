import { useEffect, useMemo, useState } from 'react';
import { fetchPokeApiJson, type NamedApiResource } from '../lib/pokeapi';

export type PokemonSearchMode = 'pokemon' | 'type' | 'move';

type TypeSearchResponse = {
  pokemon: Array<{ pokemon: NamedApiResource }>;
};

type MoveSearchResponse = {
  learned_by_pokemon: NamedApiResource[];
};

const cache = new Map<string, Set<string>>();

function apiSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function usePokemonAttributeSearch(mode: PokemonSearchMode, query: string) {
  const normalized = useMemo(() => apiSlug(query), [query]);
  const [matches, setMatches] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'pokemon' || !normalized) {
      setMatches(null);
      setLoading(false);
      setError(null);
      return;
    }

    const cacheKey = `${mode}:${normalized}`;
    const cached = cache.get(cacheKey);
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
      setMatches(null);

      try {
        const names = new Set<string>();
        if (mode === 'type') {
          const result = await fetchPokeApiJson<TypeSearchResponse>(
            `https://pokeapi.co/api/v2/type/${encodeURIComponent(normalized)}/`,
            controller.signal,
          );
          result.pokemon.forEach((row) => names.add(row.pokemon.name));
        } else {
          const result = await fetchPokeApiJson<MoveSearchResponse>(
            `https://pokeapi.co/api/v2/move/${encodeURIComponent(normalized)}/`,
            controller.signal,
          );
          result.learned_by_pokemon.forEach((row) => names.add(row.name));
        }

        if (!controller.signal.aborted) {
          cache.set(cacheKey, names);
          setMatches(names);
        }
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setMatches(new Set());
        const friendly = mode === 'type'
          ? `No Pokémon type called “${query.trim()}” was found.`
          : `No move called “${query.trim()}” was found.`;
        setError(loadError instanceof Error && !loadError.message.includes('HTTP 404') ? loadError.message : friendly);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [mode, normalized, query]);

  return { matches, loading, error, normalized };
}
