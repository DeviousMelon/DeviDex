import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PokemonCard } from '../components/PokemonCard';
import { PokemonPicker } from '../components/PokemonPicker';
import { ReportDialog } from '../components/ReportDialog';
import { UserAvatar } from '../components/UserAvatar';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { pokemonLabel, usePokemonCatalog } from '../hooks/usePokemonCatalog';
import {
  MESSAGE_PAGE_SIZE,
  addGroupMembers,
  createGroupConversation,
  deleteMessage,
  fetchMessages,
  getConversationMembers,
  getMyBlockedIds,
  getMyConversations,
  leaveGroup,
  markConversationRead,
  removeGroupMember,
  renameGroup,
  sendMessage,
  startDirectConversation,
  toChatMessage,
  type ChatConversation,
  type ChatMember,
  type ChatMessage,
} from '../lib/chat';
import { getMyFriends, socialName, timeAgo, type FriendEntry } from '../lib/social';
import { supabase } from '../lib/supabase';

type SharedPokemon = { formId: number; shiny: boolean };

export function ChatPage() {
  const { conversationId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const withUser = searchParams.get('with');
  const shareParam = searchParams.get('share');
  const initialShare = useMemo<SharedPokemon | null>(
    () => (shareParam && /^\d+$/.test(shareParam) ? { formId: Number(shareParam), shiny: searchParams.get('shiny') === '1' } : null),
    // Only read once per conversation; the composer owns it afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationId],
  );

  const loadConversations = useCallback(async () => {
    const result = await getMyConversations();
    setConversations(result.data);
    setError(result.error);
    setLoaded(true);
  }, []);

  useEffect(() => { void loadConversations(); }, [loadConversations]);

  // /chat?with=username opens (or creates) the 1-to-1 chat with that friend.
  useEffect(() => {
    if (!withUser) return;
    let cancelled = false;
    void startDirectConversation(withUser).then((result) => {
      if (cancelled) return;
      if (result.error || !result.data) {
        setError(result.error ?? 'Could not open that chat.');
        setSearchParams({}, { replace: true });
        return;
      }
      const keep = new URLSearchParams();
      if (shareParam) keep.set('share', shareParam);
      if (searchParams.get('shiny')) keep.set('shiny', searchParams.get('shiny')!);
      void loadConversations();
      navigate({ pathname: `/chat/${result.data}`, search: keep.toString() }, { replace: true });
    });
    return () => { cancelled = true; };
  }, [withUser, navigate, loadConversations, searchParams, setSearchParams, shareParam]);

  // Any message or membership change this user can see refreshes the list.
  useEffect(() => {
    if (!supabase || !user) return;
    const client = supabase;
    let timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void loadConversations(), 250);
    };
    const channel = client
      .channel(`chat-list-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, refresh)
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [loadConversations, user]);

  const active = conversations.find((conversation) => conversation.id === conversationId) ?? null;

  if (!profile?.username) {
    return (
      <main className="social-page">
        <section className="dex-empty-state">
          <strong>Pick a username first.</strong>
          <p>Chats show your username, so you need one before you can message anyone.</p>
          <Link className="button button--primary" to="/account">Set up your profile</Link>
        </section>
      </main>
    );
  }

  return (
    <main className={`chat-page${conversationId ? ' chat-page--thread-open' : ''}`}>
      <aside className="chat-sidebar" aria-label="Your chats">
        <div className="chat-sidebar__header">
          <h1>Chats</h1>
          <button className="button button--secondary button--small" type="button" onClick={() => setCreatingGroup(true)}>
            + New group
          </button>
        </div>

        {error && <p className="form-message form-message--error">{error}</p>}

        {!loaded ? (
          <p className="muted chat-sidebar__note">Loading chats…</p>
        ) : conversations.length === 0 ? (
          <div className="social-empty">
            <strong>No chats yet.</strong>
            <span>Message a friend from your <Link to="/friends">friends list</Link>, or start a group.</span>
          </div>
        ) : (
          <ul className="chat-list">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <Link
                  to={`/chat/${conversation.id}`}
                  className={`chat-list__item${conversation.id === conversationId ? ' is-active' : ''}${conversation.unreadCount ? ' is-unread' : ''}`}
                >
                  <ConversationAvatar conversation={conversation} />
                  <span className="chat-list__text">
                    <span className="chat-list__top">
                      <strong>{conversationTitle(conversation)}</strong>
                      <time dateTime={conversation.lastMessageAt}>{timeAgo(conversation.lastMessageAt)}</time>
                    </span>
                    <span className="chat-list__preview">{conversationPreview(conversation, profile.username ?? '')}</span>
                  </span>
                  {conversation.unreadCount > 0 && (
                    <span className="badge" aria-label={`${conversation.unreadCount} unread`}>
                      {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="chat-thread-pane">
        {active ? (
          <ConversationView
            key={active.id}
            conversation={active}
            initialShare={initialShare}
            onChanged={loadConversations}
            onLeft={() => {
              void loadConversations();
              navigate('/chat');
            }}
          />
        ) : conversationId && loaded && !withUser ? (
          <div className="chat-placeholder">
            <strong>That chat isn't available.</strong>
            <span>It may have been deleted, or you left it.</span>
            <Link className="button button--secondary" to="/chat">Back to chats</Link>
          </div>
        ) : (
          <div className="chat-placeholder">
            <strong>Pick a chat.</strong>
            <span>Or message a friend from your <Link to="/friends">friends list</Link>.</span>
          </div>
        )}
      </section>

      <NewGroupDialog
        open={creatingGroup}
        onClose={() => setCreatingGroup(false)}
        onCreated={(id) => {
          setCreatingGroup(false);
          void loadConversations().then(() => navigate(`/chat/${id}`));
        }}
      />
    </main>
  );
}

function conversationTitle(conversation: ChatConversation) {
  if (conversation.kind === 'group') return conversation.title ?? 'Group';
  return conversation.other ? socialName(conversation.other) : 'Deleted collector';
}

function conversationPreview(conversation: ChatConversation, myUsername: string) {
  if (!conversation.lastMessageKind) return 'No messages yet';
  if (conversation.lastMessageKind === 'system') return conversation.lastMessageBody ?? '';
  if (conversation.lastMessageDeleted) return 'Message deleted';
  const who = conversation.lastMessageSender === myUsername
    ? 'You: '
    : conversation.kind === 'group' && conversation.lastMessageSender
      ? `${conversation.lastMessageSender}: `
      : '';
  return `${who}${conversation.lastMessageBody || 'Shared a Pokémon'}`;
}

function ConversationAvatar({ conversation }: { conversation: ChatConversation }) {
  if (conversation.kind === 'direct') return <UserAvatar user={conversation.other} />;
  const initials = (conversation.title ?? 'G').trim().slice(0, 2).toUpperCase();
  return <span className="user-avatar user-avatar--md user-avatar--group" aria-hidden="true">{initials}</span>;
}

// ---------------------------------------------------------------------------
// One open conversation
// ---------------------------------------------------------------------------

function ConversationView({ conversation, initialShare, onChanged, onLeft }: {
  conversation: ChatConversation;
  initialShare: SharedPokemon | null;
  onChanged: () => Promise<void>;
  onLeft: () => void;
}) {
  const { user } = useAuth();
  const { refreshCounts } = useSocial();
  const [, setSearchParams] = useSearchParams();
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const stickToBottom = useRef(true);
  const preserveFrom = useRef<number | null>(null);
  const id = conversation.id;

  const membersById = useMemo(() => new Map(members.map((member) => [member.userId, member])), [members]);
  // Read inside the Realtime callback without resubscribing on every change.
  const membersRef = useRef(membersById);
  membersRef.current = membersById;

  const loadMembers = useCallback(async () => {
    const result = await getConversationMembers(id);
    setMembers(result.data);
  }, [id]);

  const markRead = useCallback(async () => {
    await markConversationRead(id);
    void refreshCounts();
  }, [id, refreshCounts]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchMessages(id), getConversationMembers(id), getMyBlockedIds()]).then(([messageResult, memberResult, blocked]) => {
      if (cancelled) return;
      setMessages(messageResult.data);
      setHasOlder(messageResult.data.length === MESSAGE_PAGE_SIZE);
      setMembers(memberResult.data);
      setBlockedIds(blocked);
      setError(messageResult.error ?? memberResult.error);
      setLoading(false);
      stickToBottom.current = true;
      void markRead().then(onChanged);
    });
    return () => { cancelled = true; };
  }, [id, markRead, onChanged]);

  // Live updates for this conversation only.
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const channel = client
      .channel(`chat-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return;
          const incoming = toChatMessage(payload.new as Record<string, unknown>);
          setMessages((current) => {
            const index = current.findIndex((message) => message.id === incoming.id);
            if (index === -1) return [...current, incoming];
            const next = [...current];
            next[index] = incoming;
            return next;
          });
          if (payload.eventType === 'INSERT') {
            if (incoming.kind === 'system' || (incoming.senderId && !membersRef.current.has(incoming.senderId))) void loadMembers();
            if (document.visibilityState === 'visible') void markRead();
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${id}` },
        () => void loadMembers(),
      )
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [id, loadMembers, markRead]);

  // Keep the view pinned to the newest message unless the reader scrolled up,
  // and keep the reader's place when older messages load above.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (preserveFrom.current != null) {
      list.scrollTop = list.scrollHeight - preserveFrom.current;
      preserveFrom.current = null;
    } else if (stickToBottom.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

  // Pokémon cards and sprites finish loading after the first paint and grow
  // the thread, so keep re-pinning to the bottom while the reader is there.
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) list.scrollTop = list.scrollHeight;
    });
    Array.from(list.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [messages]);

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  }

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    const result = await fetchMessages(id, oldest.createdAt);
    setLoadingOlder(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    preserveFrom.current = (listRef.current?.scrollHeight ?? 0) - (listRef.current?.scrollTop ?? 0);
    setMessages((current) => [...result.data, ...current]);
    setHasOlder(result.data.length === MESSAGE_PAGE_SIZE);
  }

  function addSent(message: ChatMessage) {
    stickToBottom.current = true;
    setMessages((current) => (current.some((existing) => existing.id === message.id) ? current : [...current, message]));
    void onChanged();
  }

  async function handleDelete(message: ChatMessage) {
    if (!window.confirm('Delete this message for everyone?')) return;
    const result = await deleteMessage(message.id);
    if (result.error) setError(result.error);
    else setMessages((current) => current.map((m) => (m.id === message.id ? { ...m, body: '', pokemonFormId: null, deletedAt: new Date().toISOString() } : m)));
  }

  const visibleMessages = messages.filter((message) => !message.senderId || !blockedIds.has(message.senderId));
  const title = conversationTitle(conversation);

  return (
    <div className="chat-thread">
      <header className="chat-thread__header">
        <Link className="chat-back" to="/chat" aria-label="Back to chats">←</Link>
        <ConversationAvatar conversation={conversation} />
        <div className="chat-thread__title">
          <strong>{title}</strong>
          <span className="muted">
            {conversation.kind === 'group'
              ? `${conversation.memberCount} ${conversation.memberCount === 1 ? 'member' : 'members'}`
              : conversation.other ? `@${conversation.other.username}` : ''}
          </span>
        </div>
        {conversation.kind === 'group' ? (
          <button className="button button--secondary button--small" type="button" onClick={() => setShowMembers((value) => !value)} aria-expanded={showMembers}>
            {showMembers ? 'Close' : 'Members'}
          </button>
        ) : conversation.other && (
          <Link className="button button--secondary button--small" to={`/friends/${encodeURIComponent(conversation.other.username)}`}>
            Compare & trade
          </Link>
        )}
      </header>

      <div className="chat-thread__body">
        <ol className="chat-messages" ref={listRef} onScroll={handleScroll} aria-live="polite">
          {hasOlder && (
            <li className="chat-messages__older">
              <button className="text-button" type="button" disabled={loadingOlder} onClick={() => void loadOlder()}>
                {loadingOlder ? 'Loading…' : 'Load earlier messages'}
              </button>
            </li>
          )}
          {loading && <li className="chat-system">Loading messages…</li>}
          {!loading && visibleMessages.length === 0 && (
            <li className="chat-system">Say hello. This is the start of your chat with {title}.</li>
          )}
          {visibleMessages.map((message, index) => {
            const previous = visibleMessages[index - 1];
            const showDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
            const continued = !showDay && previous?.kind === 'text' && previous.senderId === message.senderId
              && new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60_000;
            return (
              <MessageRow
                key={message.id}
                message={message}
                mine={message.senderId === user?.id}
                sender={message.senderId ? membersById.get(message.senderId) : undefined}
                showSender={conversation.kind === 'group' && !continued}
                continued={continued}
                dayLabel={showDay ? dayLabel(message.createdAt) : null}
                onDelete={() => void handleDelete(message)}
                onReport={() => setReportingId(message.id)}
              />
            );
          })}
        </ol>

        {showMembers && conversation.kind === 'group' && (
          <GroupPanel
            conversation={conversation}
            members={members}
            onChanged={async () => {
              await loadMembers();
              await onChanged();
            }}
            onLeft={onLeft}
          />
        )}
      </div>

      {error && <p className="form-message form-message--error chat-error">{error}</p>}

      {conversation.canMessage ? (
        <Composer
          conversationId={id}
          initialShare={initialShare}
          onShareConsumed={() => setSearchParams({}, { replace: true })}
          onSent={addSent}
        />
      ) : (
        <div className="chat-composer chat-composer--locked">
          You can only message friends. {conversation.other && (
            <>Add <Link to={`/u/${encodeURIComponent(conversation.other.username)}`}>@{conversation.other.username}</Link> again to keep chatting.</>
          )}
        </div>
      )}

      <ReportDialog
        open={reportingId != null}
        targetType="message"
        targetId={reportingId ?? ''}
        targetLabel="this message"
        onClose={() => setReportingId(null)}
      />
    </div>
  );
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function MessageRow({ message, mine, sender, showSender, continued, dayLabel: day, onDelete, onReport }: {
  message: ChatMessage;
  mine: boolean;
  sender: ChatMember | undefined;
  showSender: boolean;
  continued: boolean;
  dayLabel: string | null;
  onDelete: () => void;
  onReport: () => void;
}) {
  const time = new Date(message.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      {day && <li className="chat-day"><span>{day}</span></li>}
      {message.kind === 'system' ? (
        <li className="chat-system">{message.body}</li>
      ) : (
        <li className={`chat-message${mine ? ' chat-message--mine' : ''}${continued ? ' chat-message--continued' : ''}`}>
          {!mine && (
            <span className="chat-message__avatar">
              {!continued && <UserAvatar user={sender ?? null} size="sm" />}
            </span>
          )}
          <div className="chat-message__content">
            {showSender && !mine && (
              <span className="chat-message__sender">{sender ? socialName(sender) : 'Former member'}</span>
            )}
            {message.deletedAt ? (
              <div className="chat-bubble chat-bubble--deleted">Message deleted</div>
            ) : (
              <>
                {message.pokemonFormId != null && <PokemonCard formId={message.pokemonFormId} shiny={message.pokemonShiny} />}
                {message.body && <div className="chat-bubble">{message.body}</div>}
              </>
            )}
            <span className="chat-message__meta">
              <time dateTime={message.createdAt}>{time}</time>
              {!message.deletedAt && (
                mine
                  ? <button type="button" className="text-button" onClick={onDelete}>Delete</button>
                  : message.senderId && <button type="button" className="text-button" onClick={onReport}>Report</button>
              )}
            </span>
          </div>
        </li>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

function Composer({ conversationId, initialShare, onShareConsumed, onSent }: {
  conversationId: string;
  initialShare: SharedPokemon | null;
  onShareConsumed: () => void;
  onSent: (message: ChatMessage) => void;
}) {
  const [body, setBody] = useState('');
  const [pokemon, setPokemon] = useState<SharedPokemon | null>(initialShare);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const { catalog } = usePokemonCatalog();
  const attached = pokemon ? catalog?.byFormId.get(pokemon.formId) : undefined;

  useEffect(() => {
    if (initialShare) onShareConsumed();
    textRef.current?.focus();
    // Run once when the composer opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (sending || (!body.trim() && !pokemon)) return;
    setSending(true);
    setError(null);
    const result = await sendMessage(conversationId, body, pokemon);
    setSending(false);
    if (result.error || !result.data) {
      setError(result.error ?? 'Message not sent.');
      return;
    }
    setBody('');
    setPokemon(null);
    onSent(result.data);
    textRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <form className="chat-composer" onSubmit={send}>
      {error && <p className="form-message form-message--error">{error}</p>}
      {pokemon && (
        <div className="chat-composer__attachment">
          <span>Sharing {pokemon.shiny ? '✦ shiny ' : ''}<strong>{attached ? pokemonLabel(attached) : 'a Pokémon'}</strong></span>
          <button type="button" className="text-button" onClick={() => setPokemon(null)}>Remove</button>
        </div>
      )}
      <div className="chat-composer__row">
        <button
          className="chat-composer__share"
          type="button"
          onClick={() => setPicking(true)}
          aria-label="Share a Pokémon"
          title="Share a Pokémon"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h6m6 0h6" /><circle cx="12" cy="12" r="3" /></svg>
        </button>
        <textarea
          ref={textRef}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          maxLength={2000}
          placeholder="Message"
          aria-label="Message"
        />
        <button className="button button--primary" type="submit" disabled={sending || (!body.trim() && !pokemon)}>
          {sending ? '…' : 'Send'}
        </button>
      </div>

      <PokemonPicker
        open={picking}
        title="Share a Pokémon"
        confirmLabel="Share"
        onClose={() => setPicking(false)}
        onPick={(pick) => {
          setPokemon(pick);
          setPicking(false);
          textRef.current?.focus();
        }}
      />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Group management
// ---------------------------------------------------------------------------

function GroupPanel({ conversation, members, onChanged, onLeft }: {
  conversation: ChatConversation;
  members: ChatMember[];
  onChanged: () => Promise<void>;
  onLeft: () => void;
}) {
  const { user } = useAuth();
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [adding, setAdding] = useState<string[]>([]);
  const [title, setTitle] = useState(conversation.title ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isOwner = conversation.myRole === 'owner';

  useEffect(() => {
    void getMyFriends().then((result) => setFriends(result.data.filter((friend) => friend.relationship === 'friend')));
  }, []);

  const memberIds = new Set(members.map((member) => member.userId));
  const addable = friends.filter((friend) => !memberIds.has(friend.userId));

  async function run(action: () => Promise<{ error: string | null }>, success?: string) {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    setMessage(result.error ?? success ?? null);
    if (!result.error) await onChanged();
    return !result.error;
  }

  return (
    <aside className="group-panel" aria-label="Group members">
      {isOwner && (
        <form
          className="group-panel__rename"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => renameGroup(conversation.id, title), 'Renamed.');
          }}
        >
          <label htmlFor="group-title">Group name</label>
          <div>
            <input id="group-title" value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} />
            <button className="button button--secondary button--small" type="submit" disabled={busy || !title.trim() || title.trim() === conversation.title}>
              Save
            </button>
          </div>
        </form>
      )}

      <h3>Members</h3>
      <ul className="group-panel__members">
        {members.map((member) => (
          <li key={member.userId}>
            <UserAvatar user={member} size="sm" />
            <span>
              <strong>{socialName(member)}{member.userId === user?.id && ' (you)'}</strong>
              <small className="muted">@{member.username}{member.role === 'owner' ? ' · owner' : ''}</small>
            </span>
            {isOwner && member.userId !== user?.id && (
              <button
                type="button"
                className="text-button text-button--quiet"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Remove @${member.username} from the group?`)) {
                    void run(() => removeGroupMember(conversation.id, member.userId));
                  }
                }}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {addable.length > 0 && (
        <details className="group-panel__add">
          <summary>Add friends</summary>
          <FriendCheckList friends={addable} selected={adding} onChange={setAdding} />
          <button
            className="button button--primary button--small"
            type="button"
            disabled={busy || adding.length === 0}
            onClick={() => void run(() => addGroupMembers(conversation.id, adding)).then((ok) => ok && setAdding([]))}
          >
            Add {adding.length || ''}
          </button>
        </details>
      )}

      {message && <p className="form-message" role="status">{message}</p>}

      <button
        className="button button--danger-outline button--small group-panel__leave"
        type="button"
        disabled={busy}
        onClick={() => {
          const lastOne = members.length <= 1;
          const prompt = lastOne
            ? 'You are the last member. Leaving deletes the group and its messages.'
            : isOwner
              ? 'Leave the group? Ownership passes to the longest-standing member.'
              : 'Leave the group?';
          if (window.confirm(prompt)) {
            void leaveGroup(conversation.id).then((result) => {
              if (result.error) setMessage(result.error);
              else onLeft();
            });
          }
        }}
      >
        Leave group
      </button>
    </aside>
  );
}

function FriendCheckList({ friends, selected, onChange }: {
  friends: FriendEntry[];
  selected: string[];
  onChange: (usernames: string[]) => void;
}) {
  return (
    <ul className="friend-checklist">
      {friends.map((friend) => {
        const checked = selected.includes(friend.username);
        return (
          <li key={friend.userId}>
            <label className={checked ? 'is-selected' : undefined}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(checked ? selected.filter((name) => name !== friend.username) : [...selected, friend.username])}
              />
              <UserAvatar user={friend} size="sm" />
              <span>{socialName(friend)} <small className="muted">@{friend.username}</small></span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function NewGroupDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [friends, setFriends] = useState<FriendEntry[] | null>(null);
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setTitle('');
      setSelected([]);
      setError(null);
      setFriends(null);
      void getMyFriends().then((result) => setFriends(result.data.filter((friend) => friend.relationship === 'friend')));
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await createGroupConversation(title, selected);
    setBusy(false);
    if (result.error || !result.data) {
      setError(result.error ?? 'Could not create the group.');
      return;
    }
    onCreated(result.data);
  }

  return (
    <dialog ref={dialogRef} className="social-dialog" onClose={onClose} aria-labelledby="new-group-title">
      <form className="social-dialog__body" onSubmit={handleSubmit}>
        <p className="eyebrow">NEW GROUP</p>
        <h2 id="new-group-title">Start a group chat</h2>
        <label className="social-field">
          Group name
          <input value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Shiny hunters" required />
        </label>
        <fieldset className="social-field">
          <legend>Who's in? <span className="muted">(friends only)</span></legend>
          {friends == null ? (
            <p className="muted">Loading friends…</p>
          ) : friends.length === 0 ? (
            <p className="muted">You need at least one friend first. <Link to="/friends" onClick={onClose}>Add some</Link>.</p>
          ) : (
            <FriendCheckList friends={friends} selected={selected} onChange={setSelected} />
          )}
        </fieldset>
        {error && <p className="form-message form-message--error">{error}</p>}
        <div className="social-dialog__actions">
          <button className="button button--secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button button--primary" type="submit" disabled={busy || !title.trim() || selected.length === 0}>
            {busy ? 'Creating…' : `Create group${selected.length ? ` (${selected.length + 1})` : ''}`}
          </button>
        </div>
      </form>
    </dialog>
  );
}
