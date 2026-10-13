// Shared TypeScript shapes used across DeviDex.
// Keeping these central makes it easier to replace hand-written types with
// generated Supabase database types later without rewriting every component.
export type DexStatus = 'owned' | 'missing' | 'shiny';

export type FormCategory = 'default' | 'regional' | 'alternate' | 'pattern' | 'gender' | 'battle' | 'special';

export interface PokemonPreview {
  dexNumber: number;
  name: string;
  status: DexStatus;
}

export interface ProgressCardData {
  label: string;
  current: number;
  total: number;
  detail: string;
  tone: 'blue' | 'gold' | 'orange';
}

export type UserRole = 'user' | 'admin';

export interface UserProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_path: string | null;
  home_friend_code: string | null;
  home_friend_code_public: boolean;
  profile_public: boolean;
  collection_public: boolean;
  /** v1.8: friends may compare collections with you. */
  collection_friends_visible?: boolean;
  role: UserRole;
  created_at: string;
  updated_at: string | null;
}

export type GameDexScopeType = 'base' | 'dlc' | 'special';

export interface GameVersionOption {
  id: number;
  slug: string;
  name: string;
  shortLabel: string;
  memberOrder: number;
}

export interface GameDexSetSummary {
  id: number;
  slug: string;
  name: string;
  generation: number;
  releaseOrder: number;
  scopeType: GameDexScopeType;
  regionLabel: string | null;
  parentSetId: number | null;
  description: string | null;
  versions: GameVersionOption[];
}

export interface StartedGameDex {
  id: number;
  slug: string;
  name: string;
  generation: number;
  releaseOrder: number;
  scopeType: GameDexScopeType;
  gameName: string;
  gameSlug: string;
  livingOwned: number;
  shinyOwned: number;
  total: number;
}

// A trackable catalogue entry is a form joined to its parent species.
// Default forms are the National Living Dex entries; alternate forms can be
// switched on individually from the admin area as DeviDex's form rules mature.
export interface DexCatalogEntry {
  formId: number;
  formName: string;
  formSlug: string;
  isDefault: boolean;
  formCategory: FormCategory;
  isBattleOnly: boolean;
  supportsPlaceholder: boolean;
  spriteUrl: string | null;
  shinySpriteUrl: string | null;
  speciesId: number;
  dexNumber: number;
  speciesName: string;
  speciesSlug: string;
  generation: number;
}

export interface CollectionProgress {
  formId: number;
  normalOwned: boolean;
  shinyOwned: boolean;
}

// A main-series game shown on the Game Dexes landing page.
export interface GameSummary {
  id: number;
  slug: string;
  name: string;
  generation: number;
  releaseOrder: number;
}

// One species entry inside an individual game's Pokédex. dexNumber is the
// game's own regional number, while nationalDexNumber selects the sprite.
export interface GameDexCatalogEntry {
  setId: number;
  speciesId: number;
  dexNumber: number;
  dexSlug: string;
  dexName: string;
  dexOrder: number;
  nationalDexNumber: number;
  speciesName: string;
  speciesSlug: string;
  exclusiveGameIds: number[];
  // Base species use the long-standing species progress table. Optional forms
  // use the Phase 6B form-progress table, but both render through one catalogue.
  progressKey: string;
  formId: number | null;
  formName: string | null;
  formSlug: string | null;
  formCategory: FormCategory;
  isDefaultForm: boolean;
  isBattleOnly: boolean;
  supportsPlaceholder: boolean;
  spriteUrl: string | null;
  shinySpriteUrl: string | null;
}

export interface GameCollectionProgress {
  speciesId: number;
  normalOwned: boolean;
  shinyOwned: boolean;
}

export interface GameFormCollectionProgress {
  formId: number;
  normalOwned: boolean;
  shinyOwned: boolean;
}

export interface GameDexEntryProgress {
  normalOwned: boolean;
  shinyOwned: boolean;
}

export interface FormPreferences {
  regional: boolean;
  alternate: boolean;
  pattern: boolean;
  gender: boolean;
  battle: boolean;
  special: boolean;
}

// Phase 5 collection definitions sit on top of the shared ownership inventory.
export type CollectionGoal = 'living' | 'shiny' | 'both';
export type CollectionPresetId =
  | 'standard'
  | 'forms'
  | 'gender-forms'
  | 'shiny'
  | 'shiny-forms'
  | 'battle-forms'
  | 'everything'
  | 'custom';

export interface SavedCollectionView {
  id: string;
  name: string;
  presetId: CollectionPresetId;
  goal: CollectionGoal;
  preferences: FormPreferences;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
