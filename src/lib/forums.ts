import { callRpc, nothing, rows, type Row } from './rpc';
import { toSocialUser, type SocialUser } from './social';

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

export function listForumCategories() {
  return callRpc<ForumCategory[]>('list_forum_categories', undefined, (data) => rows(data).map((row) => ({
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
  return callRpc<ForumPost[]>(
    'list_forum_posts',
    { category_slug: category, sort_by: sort, page_limit: FORUM_PAGE_SIZE, page_offset: page * FORUM_PAGE_SIZE },
    (data) => rows(data).map(toPost),
    [],
  );
}

export function getForumPost(postId: string) {
  return callRpc<ForumPost | null>('get_forum_post', { post: postId }, (data) => {
    const row = rows(data)[0];
    return row ? toPost(row) : null;
  }, null);
}

export function getForumComments(postId: string) {
  return callRpc<ForumComment[]>('get_forum_comments', { post: postId }, (data) => rows(data).map((row) => ({
    ...authorFields(row),
    id: String(row.id),
    parentId: (row.parent_id as string | null) ?? null,
    body: String(row.body ?? ''),
    depth: Number(row.depth ?? 0),
  })), []);
}

export function createForumPost(category: string, title: string, body: string, pokemonFormId: number | null) {
  return callRpc<string | null>(
    'create_forum_post',
    { category, post_title: title, post_body: body, shared_form_id: pokemonFormId },
    (data) => (data as string) ?? null,
    null,
  );
}

export function editForumPost(postId: string, title: string, body: string) {
  return callRpc('edit_forum_post', { post: postId, post_title: title, post_body: body }, nothing, null);
}

export function deleteForumPost(postId: string) {
  return callRpc('delete_forum_post', { post: postId }, nothing, null);
}

export function createForumComment(postId: string, parentId: string | null, body: string) {
  return callRpc<string | null>('create_forum_comment', { post: postId, parent: parentId, comment_body: body }, (data) => (data as string) ?? null, null);
}

export function editForumComment(commentId: string, body: string) {
  return callRpc('edit_forum_comment', { comment: commentId, comment_body: body }, nothing, null);
}

export function deleteForumComment(commentId: string) {
  return callRpc('delete_forum_comment', { comment: commentId }, nothing, null);
}

export function voteForumPost(postId: string, vote: Vote) {
  return callRpc<number | null>('vote_forum_post', { post: postId, vote }, (data) => Number(data), null);
}

export function voteForumComment(commentId: string, vote: Vote) {
  return callRpc<number | null>('vote_forum_comment', { comment: commentId, vote }, (data) => Number(data), null);
}

export function adminSetForumPostFlags(postId: string, pinned: boolean | null, locked: boolean | null) {
  return callRpc('admin_set_forum_post_flags', { post: postId, pinned, locked }, nothing, null);
}

export function adminRemoveForumContent(kind: 'post' | 'comment', id: string) {
  return callRpc('admin_remove_forum_content', { content_kind: kind, content: id }, nothing, null);
}
