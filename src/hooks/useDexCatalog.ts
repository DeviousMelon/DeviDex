import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useGuestProgress } from '../context/GuestProgressContext';
import { useFormPreferences } from '../context/FormPreferencesContext';
import type {
  CollectionProgress,
  DexCatalogEntry,
  FormCategory,
} from '../types';

type RawCatalogRow = {
  id: number;
  name: string;
  slug: string;
  is_default: boolean;
  form_category: FormCategory;
  is_battle_only: boolean;
  supports_placeholder: boolean;
  sprite_url: string | null;
  shiny_sprite_url: string | null;
  pokemon_species:
    | {
        id: number;
        national_dex_number: number;
        name: string;
        slug: string;
        generation: number;
      }
    | Array<{
        id: number;
        national_dex_number: number;
        name: string;
        slug: string;
        generation: number;
      }>;
};

type RawProgressRow = {
  form_id: number;
  normal_owned: boolean;
  shiny_owned: boolean;
};

export function useDexCatalog() {
  const { user } = useAuth();
  const { nationalProgress, setNationalState } = useGuestProgress();
  const { categoryEnabled } = useFormPreferences();
  const [allCatalog, setAllCatalog] = useState<DexCatalogEntry[]>([]);
  const [progress, setProgress] = useState<Record<number, CollectionProgress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) {
      setError('Supabase is not configured.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // PostgREST caps ordinary responses, and a full form catalogue comfortably
    // exceeds 1,000 rows. Keep paging forever rather than rediscovering that
    // limit every time Game Freak invents another hat.
    const PAGE_SIZE = 500;
    const allCatalogRows: RawCatalogRow[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      const to = from + PAGE_SIZE - 1;
      const { data, error: catalogError } = await supabase
        .from('pokemon_forms')
        .select(`
          id,
          name,
          slug,
          is_default,
          form_category,
          is_battle_only,
          supports_placeholder,
          sprite_url,
          shiny_sprite_url,
          pokemon_species!inner (
            id,
            national_dex_number,
            name,
            slug,
            generation
          )
        `)
        .eq('is_trackable', true)
        .order('form_order', { ascending: true })
        .range(from, to);

      if (catalogError) {
        setError(catalogError.message);
        setLoading(false);
        return;
      }

      const page = (data ?? []) as unknown as RawCatalogRow[];
      allCatalogRows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    const normalized = allCatalogRows.map((row) => {
      const species = Array.isArray(row.pokemon_species)
        ? row.pokemon_species[0]
        : row.pokemon_species;

      return {
        formId: row.id,
        formName: row.name,
        formSlug: row.slug,
        isDefault: row.is_default,
        formCategory: row.form_category ?? (row.is_default ? 'default' : 'alternate'),
        isBattleOnly: row.is_battle_only ?? false,
        supportsPlaceholder: row.supports_placeholder ?? false,
        spriteUrl: row.sprite_url ?? null,
        shinySpriteUrl: row.shiny_sprite_url ?? null,
        speciesId: species.id,
        dexNumber: species.national_dex_number,
        speciesName: species.name,
        speciesSlug: species.slug,
        generation: species.generation,
      } satisfies DexCatalogEntry;
    });

    setAllCatalog(normalized);

    if (user) {
      const allProgressRows: RawProgressRow[] = [];

      for (let from = 0; ; from += PAGE_SIZE) {
        const to = from + PAGE_SIZE - 1;
        const { data, error: progressError } = await supabase
          .from('collection_progress')
          .select('form_id, normal_owned, shiny_owned')
          .eq('user_id', user.id)
          .order('form_id', { ascending: true })
          .range(from, to);

        if (progressError) {
          setError(progressError.message);
          setLoading(false);
          return;
        }

        const page = (data ?? []) as RawProgressRow[];
        allProgressRows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }

      setProgress(Object.fromEntries(
        allProgressRows.map((row) => [
          row.form_id,
          {
            formId: row.form_id,
            normalOwned: row.normal_owned,
            shinyOwned: row.shiny_owned,
          } satisfies CollectionProgress,
        ]),
      ));
    } else {
      setProgress(nationalProgress);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setCollectionState(formId: number, normalOwned: boolean, shinyOwned: boolean) {
    if (!supabase) return { error: 'Supabase is not configured.' };

    if (!user) {
      const next = { formId, normalOwned, shinyOwned };
      setProgress((current) => ({ ...current, [formId]: next }));
      setNationalState(formId, normalOwned, shinyOwned);
      return { error: null };
    }

    const before = progress[formId] ?? {
      formId,
      normalOwned: false,
      shinyOwned: false,
    };
    const next = { formId, normalOwned, shinyOwned };

    setProgress((current) => ({ ...current, [formId]: next }));

    const { error: saveError } = await supabase.from('collection_progress').upsert(
      {
        user_id: user.id,
        form_id: formId,
        normal_owned: normalOwned,
        shiny_owned: shinyOwned,
      },
      { onConflict: 'user_id,form_id' },
    );

    if (saveError) {
      setProgress((current) => ({ ...current, [formId]: before }));
      return { error: saveError.message };
    }

    return { error: null };
  }

  // Base species always count. Optional categories are filtered locally so
  // switching a form rule is instant and does not make another database call.
  const catalog = useMemo(
    () => allCatalog.filter((entry) => entry.formCategory === 'default' || categoryEnabled(entry.formCategory)),
    [allCatalog, categoryEnabled],
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<FormCategory, number> = {
      default: 0,
      regional: 0,
      alternate: 0,
      pattern: 0,
      gender: 0,
      battle: 0,
      special: 0,
    };

    allCatalog.forEach((entry) => { counts[entry.formCategory] += 1; });
    return counts;
  }, [allCatalog]);

  const stats = useMemo(() => {
    const total = catalog.length;
    const livingOwned = catalog.filter((entry) => progress[entry.formId]?.normalOwned).length;
    const shinyOwned = catalog.filter((entry) => progress[entry.formId]?.shinyOwned).length;
    const alternateForms = catalog.filter((entry) => !entry.isDefault).length;
    const availableAlternateForms = Math.max(allCatalog.length - categoryCounts.default, 0);

    return {
      total,
      livingOwned,
      shinyOwned,
      alternateForms,
      availableAlternateForms,
    };
  }, [catalog, progress, allCatalog.length, categoryCounts.default]);

  return {
    catalog,
    allCatalog,
    progress,
    stats,
    categoryCounts,
    loading,
    error,
    reload: load,
    setCollectionState,
  };
}
