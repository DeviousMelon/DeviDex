import { createClient } from '@supabase/supabase-js';

// Vite exposes browser-safe environment variables prefixed with VITE_.
// We keep these outside React components so DeviDex creates one Supabase client
// for the entire browser session, rather than a fresh client on every page.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined;

// Missing credentials are a valid setup state. The public homepage can still
// run while the login page explains what needs to be configured.
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabasePublishableKey &&
    !supabaseUrl.includes('YOUR-PROJECT') &&
    !supabasePublishableKey.includes('YOUR-PUBLISHABLE-KEY'),
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
      auth: {
        // A normal browser app can keep its session in localStorage. Supabase
        // also refreshes short-lived access tokens for us automatically.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
