import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface SocialContextValue {
  /** Friend requests waiting for you to answer. */
  incomingRequests: number;
  /** Conversations with messages you have not read. */
  unreadConversations: number;
  refreshCounts: () => Promise<void>;
}

const SocialContext = createContext<SocialContextValue | undefined>(undefined);

/**
 * Keeps the header badges current. Counts are fetched on sign-in, whenever the
 * tab regains focus, and live via Supabase Realtime when friendships or
 * messages change. Realtime only delivers rows that RLS lets this user read.
 */
export function SocialProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [incomingRequests, setIncomingRequests] = useState(0);
  const [unreadConversations, setUnreadConversations] = useState(0);

  const refreshCounts = useCallback(async () => {
    if (!supabase || !user) {
      setIncomingRequests(0);
      setUnreadConversations(0);
      return;
    }

    const [requests, unread] = await Promise.all([
      supabase
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .eq('addressee_id', user.id)
        .eq('status', 'pending'),
      supabase.rpc('get_unread_conversation_count'),
    ]);

    // Either query failing (for example before a migration has been run)
    // simply leaves that badge at zero rather than breaking the header.
    setIncomingRequests(requests.error ? 0 : requests.count ?? 0);
    setUnreadConversations(unread.error ? 0 : Number(unread.data ?? 0));
  }, [user]);

  useEffect(() => {
    void refreshCounts();
    if (!supabase || !user) return;

    const client = supabase;
    const channel = client
      .channel(`social-badges-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => void refreshCounts())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => void refreshCounts())
      .subscribe();

    const onFocus = () => void refreshCounts();
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('focus', onFocus);
      void client.removeChannel(channel);
    };
  }, [refreshCounts, user]);

  const value = useMemo(
    () => ({ incomingRequests, unreadConversations, refreshCounts }),
    [incomingRequests, unreadConversations, refreshCounts],
  );

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const context = useContext(SocialContext);
  if (!context) throw new Error('useSocial must be used inside <SocialProvider>.');
  return context;
}
