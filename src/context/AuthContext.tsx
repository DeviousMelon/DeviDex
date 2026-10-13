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
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  updateEmail: (email: string) => Promise<AuthResult>;
  deleteAccount: () => Promise<AuthResult>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // profiles.role is used by the UI to decide whether /admin should render.
  // IMPORTANT: this is convenience, not the security boundary. PostgreSQL RLS
  // and column permissions are the actual security boundary.
  async function loadProfile(userId: string) {
    if (!supabase) {
      setProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id,
        username,
        display_name,
        avatar_path,
        home_friend_code,
        home_friend_code_public,
        profile_public,
        collection_public,
        collection_friends_visible,
        role,
        created_at,
        updated_at
      `)
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);

      if (nextSession?.user.id) {
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

  async function signUp(email: string, password: string): Promise<AuthResult> {
    if (!supabase) return { error: 'Supabase has not been configured yet.' };

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // After verification, the user lands on Account where a very short
        // first-time profile form asks for username/avatar/HOME code.
        emailRedirectTo: `${window.location.origin}/account`,
      },
    });

    return { error: error?.message ?? null };
  }

  async function resetPassword(email: string): Promise<AuthResult> {
    if (!supabase) return { error: 'Supabase has not been configured yet.' };

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error?.message ?? null };
  }

  async function updatePassword(password: string): Promise<AuthResult> {
    if (!supabase) return { error: 'Supabase has not been configured yet.' };
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  }

  async function updateEmail(email: string): Promise<AuthResult> {
    if (!supabase) return { error: 'Supabase has not been configured yet.' };
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    return { error: error?.message ?? null };
  }

  /**
   * Account deletion is performed by a tiny SECURITY DEFINER database function.
   * The browser never receives service-role credentials; the function can only
   * delete auth.uid(), so a user cannot point it at somebody else's account.
   */
  async function deleteAccount(): Promise<AuthResult> {
    if (!supabase) return { error: 'Supabase has not been configured yet.' };
    const { error } = await supabase.rpc('delete_own_account');
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
      resetPassword,
      updatePassword,
      updateEmail,
      deleteAccount,
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
