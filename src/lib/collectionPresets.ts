import type { CollectionGoal, CollectionPresetId, FormPreferences } from '../types';

/**
 * Named collection presets are just convenient definitions of what counts.
 * They NEVER rewrite collection_progress, so switching presets cannot delete
 * or duplicate any Pokémon the user has already marked.
 */
export type CollectionPreset = {
  id: Exclude<CollectionPresetId, 'custom'>;
  label: string;
  shortLabel: string;
  description: string;
  goal: CollectionGoal;
  preferences: FormPreferences;
};

const baseOnly: FormPreferences = {
  regional: false,
  alternate: false,
  pattern: false,
  gender: false,
  battle: false,
  special: false,
};

const storableForms: FormPreferences = {
  regional: true,
  alternate: true,
  pattern: true,
  gender: false,
  battle: false,
  special: false,
};


const genderForms: FormPreferences = {
  ...storableForms,
  gender: true,
};

const battleForms: FormPreferences = {
  ...genderForms,
  battle: true,
};

const everything: FormPreferences = {
  regional: true,
  alternate: true,
  pattern: true,
  gender: true,
  battle: true,
  special: true,
};

export const COLLECTION_PRESETS: CollectionPreset[] = [
  {
    id: 'standard',
    label: 'Standard Living Dex',
    shortLabel: 'Standard',
    description: 'The 1,025 base species. Clean, familiar and mildly sane.',
    goal: 'living',
    preferences: baseOnly,
  },
  {
    id: 'forms',
    label: 'Form Living Dex',
    shortLabel: 'Forms',
    description: 'Base species plus regional, alternate and pattern form slots.',
    goal: 'living',
    preferences: storableForms,
  },
  {
    id: 'gender-forms',
    label: 'Gender Form Dex',
    shortLabel: 'Gender Forms',
    description: 'Form Living Dex plus visible male/female appearance slots.',
    goal: 'living',
    preferences: genderForms,
  },
  {
    id: 'shiny',
    label: 'Shiny Living Dex',
    shortLabel: 'Shiny',
    description: 'Base species only, with shiny completion treated as the main goal.',
    goal: 'shiny',
    preferences: baseOnly,
  },
  {
    id: 'shiny-forms',
    label: 'Shiny Form Dex',
    shortLabel: 'Shiny Forms',
    description: 'Shiny completion across the practical stored-form categories.',
    goal: 'shiny',
    preferences: genderForms,
  },
  {
    id: 'battle-forms',
    label: 'Battle Form Dex',
    shortLabel: 'Battle Forms',
    description: 'Practical forms plus battle-only representation slots such as Megas.',
    goal: 'living',
    preferences: battleForms,
  },
  {
    id: 'everything',
    label: 'Everything Dex',
    shortLabel: 'Everything',
    description: 'Every trackable category, including battle stand-ins and special forms.',
    goal: 'both',
    preferences: everything,
  },
];

export function getPreset(id: CollectionPresetId) {
  return COLLECTION_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function presetForDefinition(preferences: FormPreferences, goal: CollectionGoal): CollectionPresetId {
  const match = COLLECTION_PRESETS.find((preset) =>
    preset.goal === goal
    && Object.keys(preferences).every((key) =>
      preferences[key as keyof FormPreferences] === preset.preferences[key as keyof FormPreferences],
    ),
  );

  return match?.id ?? 'custom';
}

export function collectionGoalLabel(goal: CollectionGoal) {
  if (goal === 'shiny') return 'Shiny completion';
  if (goal === 'both') return 'Living + Shiny completion';
  return 'Living Dex completion';
}
