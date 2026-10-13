import { supabase } from './supabase';
import { cleanError, toSocialUser, type Result, type SocialUser } from './social';

// Wrappers around the v1.7/v1.8 chat functions. Reading messages uses the
// table directly (RLS limits it to members); every write is a database function.

export interface ChatConversation {
  id: string;
  kind: 'direct' | 'group';
  title: string | null;
  memberCount: number;
  myRole: 'owner' | 'member';
  other: SocialUser | null;
  canMessage: boolean;
  lastMessageAt: string;
  lastMessageBody: string | null;
  lastMessageKind: 'text' | 'system' | null;
  lastMessageDeleted: boolean;
  lastMessageSender: string | null;
  unreadCount: number;
}

export interface ChatMember extends SocialUser {
  role: 'owner' | 'member';
  joinedAt: string;
  isFriend: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  kind: 'text' | 'system';
  body: string;
  createdAt: string;
  deletedAt: string | null;
  pokemonFormId: number | null;
  pokemonShiny: boolean;
}

type Row = Record<string, unknown>;
const NOT_CONFIGURED = 'Supabase is not configured.';
const rows = (data: unknown) => (Array.isArray(data) ? (data as Row[]) : []);

export function toChatMessage(row: Row): ChatMessage {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderId: (row.sender_id as string | null) ?? null,
    kind: (row.kind as ChatMessage['kind']) ?? 'text',
    body: String(row.body ?? ''),
    createdAt: String(row.created_at),
    deletedAt: (row.deleted_at as string | null) ?? null,
    pokemonFormId: row.pokemon_form_id == null ? null : Number(row.pokemon_form_id),
    pokemonShiny: Boolean(row.pokemon_shiny),
  };
}

async function call<T>(name: string, args: Record<string, unknown> | undefined, map: (data: unknown) => T, fallback: T): Promise<Result<T>> {
  if (!supabase) return { data: fallback, error: NOT_CONFIGURED };
  const { data, error } = await supabase.rpc(name, args);
  if (error) return { data: fallback, error: cleanError(error.message) };
  return { data: map(data), error: null };
}

const nothing = () => null;

export function getMyConversations() {
  return call<ChatConversation[]>('get_my_conversations', undefined, (data) => rows(data).map((row) => ({
    id: String(row.conversation_id),
    kind: row.kind as ChatConversation['kind'],
    title: (row.title as string | null) ?? null,
    memberCount: Number(row.member_count ?? 0),
    myRole: (row.my_role as ChatConversation['myRole']) ?? 'member',
    other: row.other_user_id
      ? toSocialUser({
          user_id: row.other_user_id,
          username: row.other_username,
          display_name: row.other_display_name,
          avatar_path: row.other_avatar_path,
          profile_updated_at: row.other_profile_updated_at,
        })
      : null,
    canMessage: Boolean(row.can_message),
    lastMessageAt: String(row.last_message_at),
    lastMessageBody: (row.last_message_body as string | null) ?? null,
    lastMessageKind: (row.last_message_kind as ChatConversation['lastMessageKind']) ?? null,
    lastMessageDeleted: Boolean(row.last_message_deleted),
    lastMessageSender: (row.last_message_sender_username as string | null) ?? null,
    unreadCount: Number(row.unread_count ?? 0),
  })), []);
}

export function getConversationMembers(conversationId: string) {
  return call<ChatMember[]>('get_conversation_members', { conversation: conversationId }, (data) => rows(data).map((row) => ({
    ...toSocialUser(row),
    role: row.role as ChatMember['role'],
    joinedAt: String(row.joined_at),
    isFriend: Boolean(row.is_friend),
  })), []);
}

export const MESSAGE_PAGE_SIZE = 50;

/** Newest-last page of messages, optionally older than a given timestamp. */
export async function fetchMessages(conversationId: string, before?: string): Promise<Result<ChatMessage[]>> {
  if (!supabase) return { data: [], error: NOT_CONFIGURED };
  let query = supabase
    .from('messages')
    .select('id, conversation_id, sender_id, kind, body, created_at, deleted_at, pokemon_form_id, pokemon_shiny')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(MESSAGE_PAGE_SIZE);
  if (before) query = query.lt('created_at', before);

  const { data, error } = await query;
  if (error) return { data: [], error: cleanError(error.message) };
  return { data: rows(data).map(toChatMessage).reverse(), error: null };
}

export function startDirectConversation(username: string) {
  return call<string | null>('start_direct_conversation', { other_username: username }, (data) => (data as string) ?? null, null);
}

export function createGroupConversation(title: string, usernames: string[]) {
  return call<string | null>('create_group_conversation', { group_title: title, member_usernames: usernames }, (data) => (data as string) ?? null, null);
}

export function addGroupMembers(conversationId: string, usernames: string[]) {
  return call('add_group_members', { conversation: conversationId, member_usernames: usernames }, nothing, null);
}

export function removeGroupMember(conversationId: string, userId: string) {
  return call('remove_group_member', { conversation: conversationId, member: userId }, nothing, null);
}

export function renameGroup(conversationId: string, title: string) {
  return call('rename_group', { conversation: conversationId, new_title: title }, nothing, null);
}

export function leaveGroup(conversationId: string) {
  return call('leave_group', { conversation: conversationId }, nothing, null);
}

export function sendMessage(conversationId: string, body: string, pokemon?: { formId: number; shiny: boolean } | null) {
  return call<ChatMessage | null>(
    'send_message',
    {
      conversation: conversationId,
      message_body: body,
      shared_form_id: pokemon?.formId ?? null,
      shared_shiny: pokemon?.shiny ?? false,
    },
    (data) => (data && typeof data === 'object' ? toChatMessage(data as Row) : null),
    null,
  );
}

export function deleteMessage(messageId: string) {
  return call('delete_message', { message: messageId }, nothing, null);
}

export function markConversationRead(conversationId: string) {
  return call('mark_conversation_read', { conversation: conversationId }, nothing, null);
}

/** Ids of people you blocked, so their group-chat messages can be hidden. */
export async function getMyBlockedIds(): Promise<Set<string>> {
  if (!supabase) return new Set();
  const { data } = await supabase.from('user_blocks').select('blocked_id');
  return new Set(rows(data).map((row) => String(row.blocked_id)));
}
