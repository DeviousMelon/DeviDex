// Shared TypeScript shapes. Later the database types can be generated directly
// from Supabase so the frontend and PostgreSQL schema stay in sync.
export type DexStatus = 'owned' | 'missing' | 'shiny';

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
  role: UserRole;
  created_at: string;
}
