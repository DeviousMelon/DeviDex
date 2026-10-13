import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import {
  COLLECTION_PRESETS,
  getPreset,
  presetForDefinition,
} from '../lib/collectionPresets';
import type {
  CollectionGoal,
  CollectionPresetId,
  FormCategory,
  FormPreferences,
  SavedCollectionView,
} from '../types';

/**
 * The old v0.9 preference row remains as the compatibility mirror used by
 * public-profile summaries. Phase 5 adds saved collection definitions above it.
 * Ownership progress itself still lives in collection_progress and is NEVER
 * rewritten when a collector switches views or presets.
 */
export const DEFAULT_FORM_PREFERENCES: FormPreferences = {
  regional: false,
  alternate: false,
  pattern: false,
  gender: false,
  battle: false,
  special: false,
};

const DEFAULT_GOAL: CollectionGoal = 'living';
const DEFAULT_PRESET: CollectionPresetId = 'standard';

type PreferenceKey = keyof FormPreferences;

type FormPreferencesContextValue = {
  preferences: FormPreferences;
  goal: CollectionGoal;
  presetId: CollectionPresetId;
  collections: SavedCollectionView[];
  activeCollection: SavedCollectionView | null;
  loading: boolean;
  saving: boolean;
  saveError: string | null;
  setPreference: (key: PreferenceKey, enabled: boolean) => Promise<void>;
  /** Replace every form rule at once, keeping the goal. */
  setAllPreferences: (next: FormPreferences) => Promise<void>;
  setGoal: (goal: CollectionGoal) => Promise<void>;
  applyPreset: (presetId: Exclude<CollectionPresetId, 'custom'>) => Promise<void>;
  resetPreferences: () => Promise<void>;
  createCollection: (name: string) => Promise<void>;
  activateCollection: (collectionId: string) => Promise<void>;
  renameActiveCollection: (name: string) => Promise<void>;
  deleteCollection: (collectionId: string) => Promise<void>;
  categoryEnabled: (category: FormCategory) => boolean;
};

const FormPreferencesContext = createContext<FormPreferencesContextValue | undefined>(undefined);

type RawPreferenceRow = {
  include_regional: boolean;
  include_alternate: boolean;
  include_pattern: boolean;
  include_gender: boolean;
  include_battle: boolean;
  include_special: boolean;
};

type RawCollectionView = RawPreferenceRow & {
  id: string;
  name: string;
  preset_id: CollectionPresetId;
  goal: CollectionGoal;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function rowToPreferences(row: RawPreferenceRow): FormPreferences {
  return {
    regional: row.include_regional,
    alternate: row.include_alternate,
    pattern: row.include_pattern,
    gender: row.include_gender,
    battle: row.include_battle,
    special: row.include_special,
  };
}

function preferencesToRow(preferences: FormPreferences) {
  return {
    include_regional: preferences.regional,
    include_alternate: preferences.alternate,
    include_pattern: preferences.pattern,
    include_gender: preferences.gender,
    include_battle: preferences.battle,
    include_special: preferences.special,
  };
}

function normalizeCollection(row: RawCollectionView): SavedCollectionView {
  return {
    id: row.id,
    name: row.name,
    presetId: row.preset_id,
    goal: row.goal,
    preferences: rowToPreferences(row),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateCollectionName(name: string) {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean.length < 1) throw new Error('Give the collection a name first.');
  if (clean.length > 40) throw new Error('Collection names can be at most 40 characters.');
  return clean;
}

function friendlyCollectionError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (message.includes('user_collection_views_name_ci_unique') || message.toLowerCase().includes('duplicate key')) {
    return 'You already have a saved collection with that name.';
  }
  if (message.includes('up to 20 saved collection setups')) return message;
  return message || fallback;
}

export function FormPreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<FormPreferences>(DEFAULT_FORM_PREFERENCES);
  const [goal, setGoalState] = useState<CollectionGoal>(DEFAULT_GOAL);
  const [presetId, setPresetId] = useState<CollectionPresetId>(DEFAULT_PRESET);
  const [collections, setCollections] = useState<SavedCollectionView[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const loadRequest = useRef(0);

  const activeCollection = useMemo(
    () => collections.find((collection) => collection.isActive) ?? null,
    [collections],
  );

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;

    // Guests receive presets and manual rules in memory only.
    if (!user || !supabase) {
      setPreferences(DEFAULT_FORM_PREFERENCES);
      setGoalState(DEFAULT_GOAL);
      setPresetId(DEFAULT_PRESET);
      setCollections([]);
      setLoading(false);
      setSaveError(null);
      return;
    }

    setLoading(true);
    setSaveError(null);

    const [viewsResult, legacyResult] = await Promise.all([
      supabase
        .from('user_collection_views')
        .select('id, name, preset_id, goal, is_active, include_regional, include_alternate, include_pattern, include_gender, include_battle, include_special, created_at, updated_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('user_form_preferences')
        .select('include_regional, include_alternate, include_pattern, include_gender, include_battle, include_special')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    // Ignore a slow response from the account that was active before a
    // sign-in/sign-out change. Otherwise old settings can briefly win a race.
    if (requestId !== loadRequest.current) return;

    if (viewsResult.error) {
      setSaveError(viewsResult.error.message);
      setLoading(false);
      return;
    }

    const normalizedViews = ((viewsResult.data ?? []) as RawCollectionView[]).map(normalizeCollection);
    setCollections(normalizedViews);

    const active = normalizedViews.find((collection) => collection.isActive) ?? normalizedViews[0] ?? null;
    if (active) {
      setPreferences(active.preferences);
      setGoalState(active.goal);
      setPresetId(active.presetId);
    } else if (!legacyResult.error && legacyResult.data) {
      const legacyPreferences = rowToPreferences(legacyResult.data as RawPreferenceRow);
      setPreferences(legacyPreferences);
      setGoalState(DEFAULT_GOAL);
      setPresetId(presetForDefinition(legacyPreferences, DEFAULT_GOAL));
    } else {
      setPreferences(DEFAULT_FORM_PREFERENCES);
      setGoalState(DEFAULT_GOAL);
      setPresetId(DEFAULT_PRESET);
    }

    if (legacyResult.error) setSaveError(legacyResult.error.message);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
    return () => { loadRequest.current += 1; };
  }, [load]);

  const persistDefinition = useCallback(async (
    nextPreferences: FormPreferences,
    nextGoal: CollectionGoal,
    nextPresetId: CollectionPresetId,
  ) => {
    if (!user || !supabase) return;

    // One RPC updates the active saved view and the v0.9 compatibility mirror
    // in a single PostgreSQL transaction. No half-saved collection rules.
    const { error } = await supabase.rpc('update_own_active_collection_definition', {
      p_preset_id: nextPresetId,
      p_goal: nextGoal,
      p_include_regional: nextPreferences.regional,
      p_include_alternate: nextPreferences.alternate,
      p_include_pattern: nextPreferences.pattern,
      p_include_gender: nextPreferences.gender,
      p_include_battle: nextPreferences.battle,
      p_include_special: nextPreferences.special,
    });

    if (error) throw new Error(error.message);
  }, [user]);

  const commitDefinition = useCallback(async (
    nextPreferences: FormPreferences,
    nextGoal: CollectionGoal,
    nextPresetId: CollectionPresetId,
  ) => {
    const beforePreferences = preferences;
    const beforeGoal = goal;
    const beforePresetId = presetId;

    setPreferences(nextPreferences);
    setGoalState(nextGoal);
    setPresetId(nextPresetId);
    setSaveError(null);
    setSaving(true);

    try {
      await persistDefinition(nextPreferences, nextGoal, nextPresetId);
      // Keep the local saved-view list in step with what we just persisted.
      if (activeCollection) {
        setCollections((current) => current.map((collection) =>
          collection.id === activeCollection.id
            ? {
                ...collection,
                preferences: nextPreferences,
                goal: nextGoal,
                presetId: nextPresetId,
              }
            : collection,
        ));
      }
    } catch (error) {
      setPreferences(beforePreferences);
      setGoalState(beforeGoal);
      setPresetId(beforePresetId);
      setSaveError(error instanceof Error ? error.message : 'Could not save collection settings.');
    } finally {
      setSaving(false);
    }
  }, [activeCollection, goal, persistDefinition, preferences, presetId]);

  const setPreference = useCallback(async (key: PreferenceKey, enabled: boolean) => {
    const next = { ...preferences, [key]: enabled };
    const nextPreset = presetForDefinition(next, goal);
    await commitDefinition(next, goal, nextPreset);
  }, [commitDefinition, goal, preferences]);

  const setAllPreferences = useCallback(async (next: FormPreferences) => {
    await commitDefinition({ ...next }, goal, presetForDefinition(next, goal));
  }, [commitDefinition, goal]);

  const setGoal = useCallback(async (nextGoal: CollectionGoal) => {
    const nextPreset = presetForDefinition(preferences, nextGoal);
    await commitDefinition(preferences, nextGoal, nextPreset);
  }, [commitDefinition, preferences]);

  const applyPreset = useCallback(async (nextPresetId: Exclude<CollectionPresetId, 'custom'>) => {
    const preset = getPreset(nextPresetId);
    if (!preset) return;
    await commitDefinition({ ...preset.preferences }, preset.goal, preset.id);
  }, [commitDefinition]);

  const resetPreferences = useCallback(async () => {
    await applyPreset('standard');
  }, [applyPreset]);

  const activateCollection = useCallback(async (collectionId: string) => {
    if (!user || !supabase) return;
    const target = collections.find((collection) => collection.id === collectionId);
    if (!target || target.isActive) return;

    setSaveError(null);
    setSaving(true);

    try {
      const { error } = await supabase.rpc('activate_own_collection_view', {
        candidate: collectionId,
      });
      if (error) throw new Error(error.message);

      setCollections((current) => current.map((collection) => ({
        ...collection,
        isActive: collection.id === collectionId,
      })));
      setPreferences(target.preferences);
      setGoalState(target.goal);
      setPresetId(target.presetId);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not switch collection.');
    } finally {
      setSaving(false);
    }
  }, [collections, user]);

  const createCollection = useCallback(async (name: string) => {
    if (!user || !supabase) throw new Error('Sign in to save multiple collection setups.');
    const cleanName = validateCollectionName(name);

    setSaveError(null);
    setSaving(true);

    try {
      const { data, error } = await supabase
        .from('user_collection_views')
        .insert({
          user_id: user.id,
          name: cleanName,
          preset_id: presetId,
          goal,
          ...preferencesToRow(preferences),
          is_active: false,
        })
        .select('id, name, preset_id, goal, is_active, include_regional, include_alternate, include_pattern, include_gender, include_battle, include_special, created_at, updated_at')
        .single();

      if (error) throw new Error(error.message);
      const created = normalizeCollection(data as RawCollectionView);
      setCollections((current) => [...current, created]);

      // Creating a setup makes it active immediately, which matches what a
      // human means by “save this as Shiny Forms” rather better than hiding it.
      const { error: activationError } = await supabase.rpc('activate_own_collection_view', {
        candidate: created.id,
      });
      if (activationError) throw new Error(activationError.message);

      setCollections((current) => current.map((collection) => ({
        ...collection,
        isActive: collection.id === created.id,
      })));
    } catch (error) {
      const message = friendlyCollectionError(error, 'Could not create that collection.');
      setSaveError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }, [goal, preferences, presetId, user]);

  const renameActiveCollection = useCallback(async (name: string) => {
    if (!user || !supabase || !activeCollection) return;
    const cleanName = validateCollectionName(name);

    setSaveError(null);
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_collection_views')
        .update({ name: cleanName })
        .eq('id', activeCollection.id)
        .eq('user_id', user.id);
      if (error) throw new Error(error.message);

      setCollections((current) => current.map((collection) =>
        collection.id === activeCollection.id ? { ...collection, name: cleanName } : collection,
      ));
    } catch (error) {
      const message = friendlyCollectionError(error, 'Could not rename that collection.');
      setSaveError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }, [activeCollection, user]);

  const deleteCollection = useCallback(async (collectionId: string) => {
    if (!user || !supabase) return;
    const target = collections.find((collection) => collection.id === collectionId);
    if (!target) return;
    if (target.isActive) throw new Error('Switch to another collection before deleting this one.');
    if (collections.length <= 1) throw new Error('Keep at least one saved collection.');

    setSaveError(null);
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_collection_views')
        .delete()
        .eq('id', collectionId)
        .eq('user_id', user.id);
      if (error) throw new Error(error.message);
      setCollections((current) => current.filter((collection) => collection.id !== collectionId));
    } catch (error) {
      const message = friendlyCollectionError(error, 'Could not delete that collection.');
      setSaveError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }, [collections, user]);

  const categoryEnabled = useCallback((category: FormCategory) => {
    if (category === 'default') return true;
    return preferences[category] ?? false;
  }, [preferences]);

  const value = useMemo<FormPreferencesContextValue>(() => ({
    preferences,
    goal,
    presetId,
    collections,
    activeCollection,
    loading,
    saving,
    saveError,
    setPreference,
    setAllPreferences,
    setGoal,
    applyPreset,
    resetPreferences,
    createCollection,
    activateCollection,
    renameActiveCollection,
    deleteCollection,
    categoryEnabled,
  }), [
    preferences,
    goal,
    presetId,
    collections,
    activeCollection,
    loading,
    saving,
    saveError,
    setPreference,
    setAllPreferences,
    setGoal,
    applyPreset,
    resetPreferences,
    createCollection,
    activateCollection,
    renameActiveCollection,
    deleteCollection,
    categoryEnabled,
  ]);

  return (
    <FormPreferencesContext.Provider value={value}>
      {children}
    </FormPreferencesContext.Provider>
  );
}

export function useFormPreferences() {
  const context = useContext(FormPreferencesContext);
  if (!context) {
    throw new Error('useFormPreferences must be used inside <FormPreferencesProvider>.');
  }
  return context;
}

// Exported for UI rendering without duplicating the definitions.
export { COLLECTION_PRESETS };
