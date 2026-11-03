import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePokemonCatalog } from './usePokemonCatalog';
import type { DexCatalogEntry } from '../types';

/**
 * Keeps a tool's chosen Pokémon in the URL as a form slug (?form=rotom-wash),
 * so tool pages can be linked to from Pokémon pages and shared.
 */
export function useFormParam(name = 'form') {
  const [searchParams, setSearchParams] = useSearchParams();
  const { catalog } = usePokemonCatalog();
  const slug = searchParams.get(name);

  const entry = useMemo<DexCatalogEntry | null>(() => {
    if (!catalog || !slug) return null;
    return catalog.entries.find((item) => item.formSlug === slug)
      ?? catalog.entries.find((item) => item.isDefault && item.speciesSlug === slug)
      ?? null;
  }, [catalog, slug]);

  const setFormId = useCallback((formId: number) => {
    const picked = catalog?.byFormId.get(formId);
    if (!picked) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set(name, picked.formSlug);
      return next;
    }, { replace: true });
  }, [catalog, name, setSearchParams]);

  return [entry, setFormId] as const;
}

/** A plain URL search param with a default, for tool settings worth sharing. */
export function useSearchParamState(name: string, fallback: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(name) ?? fallback;
  const setValue = useCallback((next: string) => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (next === fallback) params.delete(name); else params.set(name, next);
      return params;
    }, { replace: true });
  }, [fallback, name, setSearchParams]);
  return [value, setValue] as const;
}
