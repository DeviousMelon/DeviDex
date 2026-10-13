import { supabase } from './supabase';
import type { UserProfile } from '../types';

export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;

export function usernameProblem(username: string): string | null {
  const trimmed = username.trim();
  if (!USERNAME_PATTERN.test(trimmed)) {
    return 'Use 3–20 letters, numbers, underscores or hyphens.';
  }
  return null;
}

/** Ask the database, rather than guessing in React, whether a username is free. */
export async function isUsernameAvailable(username: string) {
  if (!supabase) return { available: false, error: 'Supabase is not configured.' };

  const problem = usernameProblem(username);
  if (problem) return { available: false, error: problem };

  const { data, error } = await supabase.rpc('is_username_available', {
    candidate: username.trim(),
  });

  return {
    available: Boolean(data),
    error: error?.message ?? null,
  };
}

/** Convert an avatar object path into the public URL served by Supabase Storage. */
export function profileAvatarUrl(profile: UserProfile | null | undefined) {
  if (!supabase || !profile?.avatar_path) return null;

  const { data } = supabase.storage.from('avatars').getPublicUrl(profile.avatar_path);
  const cacheBust = profile.updated_at ? `?v=${encodeURIComponent(profile.updated_at)}` : '';
  return `${data.publicUrl}${cacheBust}`;
}
