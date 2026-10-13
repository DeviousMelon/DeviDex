import { supabase } from './supabase';

// Thin wrappers around the v1.6+ social database functions. Every write is a
// database function that checks permissions server-side; these helpers only
// tidy up the shapes and error messages for React.

export type Result<T = null> = { data: T; error: string | null };

/** The small public shape the database hands back for other collectors. */
export interface SocialUser {
  userId: string;
  username: string;
  displayName: string | null;
  avatarPath: string | null;
  profileUpdatedAt: string | null;
}

export type FriendRelationship = 'friend' | 'incoming' | 'outgoing';
export type ProfileRelationship = 'self' | 'none' | FriendRelationship | 'blocked';

export interface FriendEntry extends SocialUser {
  friendshipId: string;
  relationship: FriendRelationship;
  since: string;
}

export interface BlockedUser extends SocialUser {
  blockedAt: string;
}

export type ReportTargetType = 'user' | 'message' | 'forum_post' | 'forum_comment';
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'scam' | 'impersonation' | 'other';
export type ReportStatus = 'open' | 'actioned' | 'dismissed';

export const REPORT_REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'spam', label: 'Spam' },
  { value: 'scam', label: 'Scam or dodgy trade' },
  { value: 'impersonation', label: 'Pretending to be someone else' },
  { value: 'other', label: 'Something else' },
];

export interface AdminReport {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  targetUserId: string | null;
  targetUsername: string | null;
  contentSnapshot: string | null;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reporterUsername: string | null;
  resolvedByUsername: string | null;
}

type Row = Record<string, unknown>;

const NOT_CONFIGURED = 'Supabase is not configured.';

/** Supabase prefixes database errors with nothing useful; keep the message only. */
export function cleanError(message: string | undefined | null): string | null {
  if (!message) return null;
  return message.replace(/^.*?ERROR:\s*/, '');
}

export function toSocialUser(row: Row): SocialUser {
  return {
    userId: String(row.user_id),
    username: String(row.username ?? 'unknown'),
    displayName: (row.display_name as string | null) ?? null,
    avatarPath: (row.avatar_path as string | null) ?? null,
    profileUpdatedAt: (row.profile_updated_at as string | null) ?? null,
  };
}

/** Public avatar URL for any collector, matching profileAvatarUrl()'s caching. */
export function socialAvatarUrl(user: Pick<SocialUser, 'avatarPath' | 'profileUpdatedAt'> | null | undefined) {
  if (!supabase || !user?.avatarPath) return null;
  const { data } = supabase.storage.from('avatars').getPublicUrl(user.avatarPath);
  const cacheBust = user.profileUpdatedAt ? `?v=${encodeURIComponent(user.profileUpdatedAt)}` : '';
  return `${data.publicUrl}${cacheBust}`;
}

export function socialName(user: Pick<SocialUser, 'displayName' | 'username'>) {
  return user.displayName?.trim() || user.username;
}

async function rpc<T>(name: string, args: Record<string, unknown> | undefined, map: (data: unknown) => T, fallback: T): Promise<Result<T>> {
  if (!supabase) return { data: fallback, error: NOT_CONFIGURED };
  const { data, error } = await supabase.rpc(name, args);
  if (error) return { data: fallback, error: cleanError(error.message) };
  return { data: map(data), error: null };
}

const rows = (data: unknown) => (Array.isArray(data) ? (data as Row[]) : []);
const nothing = () => null;

// ---- Friends ---------------------------------------------------------------

export type FriendRequestOutcome = 'requested' | 'accepted' | 'already_requested' | 'already_friends';

export function sendFriendRequest(username: string) {
  return rpc<FriendRequestOutcome | null>(
    'send_friend_request',
    { target_username: username.trim().replace(/^@/, '') },
    (data) => data as FriendRequestOutcome,
    null,
  );
}

export function respondToFriendRequest(friendshipId: string, accept: boolean) {
  return rpc('respond_friend_request', { request_id: friendshipId, accept }, nothing, null);
}

export function removeFriend(userId: string) {
  return rpc('remove_friend', { other_user: userId }, nothing, null);
}

export function blockUser(userId: string) {
  return rpc('block_user', { other_user: userId }, nothing, null);
}

export function unblockUser(userId: string) {
  return rpc('unblock_user', { other_user: userId }, nothing, null);
}

export function getMyFriends() {
  return rpc<FriendEntry[]>('get_my_friends', undefined, (data) => rows(data).map((row) => ({
    ...toSocialUser(row),
    friendshipId: String(row.friendship_id),
    relationship: row.relationship as FriendRelationship,
    since: String(row.since),
  })), []);
}

export function getMyBlockedUsers() {
  return rpc<BlockedUser[]>('get_my_blocked_users', undefined, (data) => rows(data).map((row) => ({
    ...toSocialUser(row),
    blockedAt: String(row.blocked_at),
  })), []);
}

export function getRelationship(username: string) {
  return rpc<{ userId: string; relationship: ProfileRelationship } | null>(
    'get_relationship',
    { other_username: username },
    (data) => {
      const row = rows(data)[0];
      return row ? { userId: String(row.user_id), relationship: row.relationship as ProfileRelationship } : null;
    },
    null,
  );
}

// ---- Reports ---------------------------------------------------------------

export function submitReport(targetType: ReportTargetType, targetId: string, reason: ReportReason, details: string) {
  return rpc<string | null>(
    'submit_report',
    { report_target_type: targetType, report_target_id: targetId, report_reason: reason, report_details: details },
    (data) => (data as string) ?? null,
    null,
  );
}

export function getReports(status: ReportStatus | 'all') {
  return rpc<AdminReport[]>('get_reports', { status_filter: status }, (data) => rows(data).map((row) => ({
    id: String(row.id),
    targetType: row.target_type as ReportTargetType,
    targetId: String(row.target_id),
    targetUserId: (row.target_user_id as string | null) ?? null,
    targetUsername: (row.target_username as string | null) ?? null,
    contentSnapshot: (row.content_snapshot as string | null) ?? null,
    reason: row.reason as ReportReason,
    details: (row.details as string | null) ?? null,
    status: row.status as ReportStatus,
    adminNote: (row.admin_note as string | null) ?? null,
    createdAt: String(row.created_at),
    resolvedAt: (row.resolved_at as string | null) ?? null,
    reporterUsername: (row.reporter_username as string | null) ?? null,
    resolvedByUsername: (row.resolved_by_username as string | null) ?? null,
  })), []);
}

export function resolveReport(reportId: string, status: ReportStatus, note: string) {
  return rpc('resolve_report', { report_id: reportId, new_status: status, note }, nothing, null);
}

// ---- Formatting ------------------------------------------------------------

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "just now", "5 minutes ago", "yesterday", then a plain date. */
export function timeAgo(iso: string) {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'just now';
  if (abs < 3600) return relativeFormatter.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return relativeFormatter.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86400 * 7) return relativeFormatter.format(Math.round(seconds / 86400), 'day');
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
