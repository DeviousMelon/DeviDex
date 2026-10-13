import { supabase } from './supabase';
import { cleanError, toSocialUser, type Result, type SocialUser } from './social';

// v1.9 forums. Reads work signed out; writes need an account with a username.

export type ForumSort = 'hot' | 'new' | 'top';
export type Vote = -1 | 0 | 1;

export interface ForumCategory {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  adminOnlyPosts: boolean;
  postCount: number;
  lastActivityAt: string | null;
}

interface ForumAuthorFields {
  /** null when the content is deleted or the account is gone. */
  author: (SocialUser & { isAdmin: boolean }) | null;
  /** You blocked the author: show it folded away. */
  authorBlocked: boolean;
  myVote: Vote;
  score: number;
  createdAt: string;
  editedAt: string | null;
  isDeleted: boolean;
  removedByAdmin: boolean;
}

export interface ForumPost extends ForumAuthorFields {
  id: string;
  categorySlug: string;
  categoryName: string;
  title: string;
  body: string;
  pokemonFormId: number | null;
  isPinned: boolean;
  isLocked: boolean;
  commentCount: number;
  lastActivityAt: string;
}

export interface ForumComment extends ForumAuthorFields {
  id: string;
  parentId: string | null;
  body: string;
  depth: number;
}

type Row = Record<string, unknown>;
const NOT_CONFIGURED = 'Supabase is not configured.';
const rows = (data: unknown) => (Array.isArray(data) ? (data as Row[]) : []);

function authorFields(row: Row): ForumAuthorFields {
  return {
    author: row.author_id
      ? {
          ...toSocialUser({
            user_id: row.author_id,
            username: row.author_username,
            display_name: row.author_display_name,
            avatar_path: row.author_avatar_path,
            profile_updated_at: row.author_profile_updated_at,
          }),
          isAdmin: Boolean(row.author_is_admin),
        }
      : null,
    authorBlocked: Boolean(row.author_blocked),
    myVote: (Number(row.my_vote ?? 0) as Vote),
    score: Number(row.score ?? 0),
    createdAt: String(row.created_at),
    editedAt: (row.edited_at as string | null) ?? null,
    isDeleted: Boolean(row.is_deleted),
    removedByAdmin: Boolean(row.removed_by_admin),
  };
}

function toPost(row: Row): ForumPost {
  return {
    ...authorFields(row),
    id: String(row.id),
    categorySlug: String(row.category_slug),
    categoryName: String(row.category_name),
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    pokemonFormId: row.pokemon_form_id == null ? null : Number(row.pokemon_form_id),
    isPinned: Boolean(row.is_pinned),
    isLocked: Boolean(row.is_locked),
    commentCount: Number(row.comment_count ?? 0),
    lastActivityAt: String(row.last_activity_at),
  };
}

async function call<T>(name: string, args: Record<string, unknown> | undefined, map: (data: unknown) => T, fallback: T): Promise<Result<T>> {
  if (!supabase) return { data: fallback, error: NOT_CONFIGURED };
  const { data, error } = await supabase.rpc(name, args);
  if (error) return { data: fallback, error: cleanError(error.message) };
  return { data: map(data), error: null };
}

const nothing = () => null;

export function listForumCategories() {
  return call<ForumCategory[]>('list_forum_categories', undefined, (data) => rows(data).map((row) => ({
    id: Number(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    adminOnlyPosts: Boolean(row.admin_only_posts),
    postCount: Number(row.post_count ?? 0),
    lastActivityAt: (row.last_activity_at as string | null) ?? null,
  })), []);
}

export const FORUM_PAGE_SIZE = 25;

export function listForumPosts(category: string | null, sort: ForumSort, page: number) {
  return call<ForumPost[]>(
    'list_forum_posts',
    { category_slug: category, sort_by: sort, page_limit: FORUM_PAGE_SIZE, page_offset: page * FORUM_PAGE_SIZE },
    (data) => rows(data).map(toPost),
    [],
  );
}

export function getForumPost(postId: string) {
  return call<ForumPost | null>('get_forum_post', { post: postId }, (data) => {
    const row = rows(data)[0];
    return row ? toPost(row) : null;
  }, null);
}

export function getForumComments(postId: string) {
  return call<ForumComment[]>('get_forum_comments', { post: postId }, (data) => rows(data).map((row) => ({
    ...authorFields(row),
    id: String(row.id),
    parentId: (row.parent_id as string | null) ?? null,
    body: String(row.body ?? ''),
    depth: Number(row.depth ?? 0),
  })), []);
}

export function createForumPost(category: string, title: string, body: string, pokemonFormId: number | null) {
  return call<string | null>(
    'create_forum_post',
    { category, post_title: title, post_body: body, shared_form_id: pokemonFormId },
    (data) => (data as string) ?? null,
    null,
  );
}

export function editForumPost(postId: string, title: string, body: string) {
  return call('edit_forum_post', { post: postId, post_title: title, post_body: body }, nothing, null);
}

export function deleteForumPost(postId: string) {
  return call('delete_forum_post', { post: postId }, nothing, null);
}

export function createForumComment(postId: string, parentId: string | null, body: string) {
  return call<string | null>('create_forum_comment', { post: postId, parent: parentId, comment_body: body }, (data) => (data as string) ?? null, null);
}

export function editForumComment(commentId: string, body: string) {
  return call('edit_forum_comment', { comment: commentId, comment_body: body }, nothing, null);
}

export function deleteForumComment(commentId: string) {
  return call('delete_forum_comment', { comment: commentId }, nothing, null);
}

export function voteForumPost(postId: string, vote: Vote) {
  return call<number | null>('vote_forum_post', { post: postId, vote }, (data) => Number(data), null);
}

export function voteForumComment(commentId: string, vote: Vote) {
  return call<number | null>('vote_forum_comment', { comment: commentId, vote }, (data) => Number(data), null);
}

export function adminSetForumPostFlags(postId: string, pinned: boolean | null, locked: boolean | null) {
  return call('admin_set_forum_post_flags', { post: postId, pinned, locked }, nothing, null);
}

export function adminRemoveForumContent(kind: 'post' | 'comment', id: string) {
  return call('admin_remove_forum_content', { content_kind: kind, content: id }, nothing, null);
}
