import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { UserProfile } from '../types';

type AuthResult = { error: string | null };

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, username: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // profiles.role is used by the UI to decide whether /admin should render.
  // IMPORTANT: this is convenience, not the security boundary. The database
  // policies in supabase/migrations/001_schema.sql are what actually enforce admin access.
  async function loadProfile(userId: string) {
    if (!supabase) {
      setProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, role, created_at')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Could not load DeviDex profile:', error.message);
      setProfile(null);
      return;
    }

    setProfile(data as UserProfile);
  }

  async function refreshProfile() {
    if (session?.user.id) await loadProfile(session.user.id);
  }

  useEffect(() => {
    // Before Supabase credentials exist, finish loading instead of crashing the
    // entire site. This means you can keep working on public pages first.
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    async function initialiseAuth() {
      const { data, error } = await supabase!.auth.getSession();
      if (!mounted) return;

      if (error) console.error('Could not restore Supabase session:', error.message);

      const restoredSession = data.session ?? null;
      setSession(restoredSession);

      if (restoredSession?.user.id) await loadProfile(restoredSession.user.id);
      if (mounted) setLoading(false);
    }

    initialiseAuth();

    // Supabase fires this when login/logout/token refresh changes the session.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);

      if (nextSession?.user.id) {
        // Keep protected routes in their loading state until the user's role is
        // known. Otherwise /admin could redirect before the profile query ends.
        setLoading(true);
        window.setTimeout(async () => {
          await loadProfile(nextSession.user.id);
          if (mounted) setLoading(false);
        }, 0);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string): Promise<AuthResult> {
    if (!supabase) return { error: 'Supabase has not been configured yet.' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUp(
    email: string,
    password: string,
    username: string,
  ): Promise<AuthResult> {
    if (!supabase) return { error: 'Supabase has not been configured yet.' };

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // If email confirmation is enabled, Supabase can send the user back to
        // the same DeviDex origin they signed up from. Add that origin to
        // Supabase Auth -> URL Configuration -> Redirect URLs first.
        emailRedirectTo: `${window.location.origin}/account`,

        // The database trigger copies this into public.profiles on account creation.
        data: { username: username.trim() || null },
      },
    });

    return { error: error?.message ?? null };
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Could not sign out:', error.message);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      profile,
      loading,
      configured: isSupabaseConfigured,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
