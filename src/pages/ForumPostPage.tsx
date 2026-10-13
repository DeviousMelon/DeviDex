import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PokemonCard } from '../components/PokemonCard';
import { ReportDialog } from '../components/ReportDialog';
import { VoteButtons } from '../components/VoteButtons';
import { useAuth } from '../context/AuthContext';
import {
  adminRemoveForumContent,
  adminSetForumPostFlags,
  createForumComment,
  deleteForumComment,
  deleteForumPost,
  editForumComment,
  editForumPost,
  getForumComments,
  getForumPost,
  voteForumComment,
  voteForumPost,
  type ForumComment,
  type ForumPost,
} from '../lib/forums';
import type { ReportTargetType } from '../lib/social';
import { AuthorLine } from './ForumsPage';

type Reporting = { type: ReportTargetType; id: string; label: string } | null;

export function ForumPostPage() {
  const { postId = '' } = useParams();
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [post, setPost] = useState<ForumPost | null>(null);
  const [comments, setComments] = useState<ForumComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [reporting, setReporting] = useState<Reporting>(null);

  const load = useCallback(async () => {
    const [postResult, commentResult] = await Promise.all([getForumPost(postId), getForumComments(postId)]);
    setPost(postResult.data);
    setComments(commentResult.data);
    setError(postResult.error ?? commentResult.error);
    setLoading(false);
  }, [postId]);

  useEffect(() => { void load(); }, [load]);

  // Children grouped by parent, best-first like Reddit: score, then oldest.
  const tree = useMemo(() => {
    const byParent = new Map<string | null, ForumComment[]>();
    for (const comment of comments) {
      const list = byParent.get(comment.parentId) ?? [];
      list.push(comment);
      byParent.set(comment.parentId, list);
    }
    for (const list of byParent.values()) {
      list.sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt));
    }
    return byParent;
  }, [comments]);

  async function run(action: () => Promise<{ error: string | null }>) {
    const result = await action();
    if (result.error) setError(result.error);
    await load();
    return !result.error;
  }

  if (loading) return <main className="forum-thread-page"><p className="muted">Loading…</p></main>;

  if (!post) {
    return (
      <main className="forum-thread-page">
        <section className="dex-empty-state">
          <strong>That post doesn't exist.</strong>
          <Link className="button button--secondary" to="/forums">Back to the forums</Link>
        </section>
      </main>
    );
  }

  const mine = Boolean(user && post.author?.userId === user.id);
  const hidden = post.authorBlocked && !showHidden;
  const canComment = Boolean(user && profile?.username && !post.isDeleted && (!post.isLocked || isAdmin));

  return (
    <main className="forum-thread-page">
      <Link className="text-button" to={`/forums/${post.categorySlug}`}>← {post.categoryName}</Link>

      {error && <p className="form-message form-message--error">{error}</p>}

      <article className="forum-thread">
        <VoteButtons
          score={post.score}
          myVote={post.myVote}
          disabled={post.isDeleted}
          label={post.title}
          onVote={(vote) => voteForumPost(post.id, vote)}
        />
        <div className="forum-thread__main">
          <div className="forum-post-card__meta">
            {post.isPinned && <span className="forum-tag forum-tag--pinned">Pinned</span>}
            {post.isLocked && <span className="forum-tag">Locked</span>}
            <AuthorLine post={post} />
          </div>

          {hidden ? (
            <p className="muted">
              This is from someone you blocked. <button className="text-button" type="button" onClick={() => setShowHidden(true)}>Show it</button>
            </p>
          ) : editing ? (
            <PostEditor
              post={post}
              onCancel={() => setEditing(false)}
              onSave={async (title, body) => {
                const ok = await run(() => editForumPost(post.id, title, body));
                if (ok) setEditing(false);
              }}
            />
          ) : (
            <>
              <h1>{post.title}</h1>
              {post.isDeleted ? (
                <p className="muted">{post.removedByAdmin ? 'Removed by an admin.' : 'Deleted by its author.'}</p>
              ) : (
                <>
                  {post.pokemonFormId != null && <PokemonCard formId={post.pokemonFormId} shiny={false} />}
                  {post.body && <div className="forum-body">{post.body}</div>}
                </>
              )}
            </>
          )}

          {!post.isDeleted && !editing && (
            <div className="forum-actions">
              {mine && <button className="text-button" type="button" onClick={() => setEditing(true)}>Edit</button>}
              {mine && (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    if (window.confirm('Delete your post? Comments stay, but the post shows as [deleted].')) void run(() => deleteForumPost(post.id));
                  }}
                >
                  Delete
                </button>
              )}
              {user && !mine && (
                <button className="text-button" type="button" onClick={() => setReporting({ type: 'forum_post', id: post.id, label: 'this post' })}>
                  Report
                </button>
              )}
              {isAdmin && (
                <span className="forum-admin-actions">
                  <button className="text-button" type="button" onClick={() => void run(() => adminSetForumPostFlags(post.id, !post.isPinned, null))}>
                    {post.isPinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button className="text-button" type="button" onClick={() => void run(() => adminSetForumPostFlags(post.id, null, !post.isLocked))}>
                    {post.isLocked ? 'Unlock' : 'Lock'}
                  </button>
                  {!mine && (
                    <button
                      className="text-button text-button--danger"
                      type="button"
                      onClick={() => {
                        if (window.confirm('Remove this post as an admin?')) void run(() => adminRemoveForumContent('post', post.id));
                      }}
                    >
                      Remove
                    </button>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
      </article>

      <section className="forum-comments">
        <h2>{post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}</h2>

        {canComment ? (
          <CommentForm
            placeholder="Add a comment"
            onSubmit={(body) => run(() => createForumComment(post.id, null, body))}
          />
        ) : !user ? (
          <p className="muted"><Link to="/login">Sign in</Link> to join in.</p>
        ) : !profile?.username ? (
          <p className="muted"><Link to="/account">Pick a username</Link> to comment.</p>
        ) : post.isLocked ? (
          <p className="muted">This post is locked.</p>
        ) : null}

        <CommentList
          parentId={null}
          tree={tree}
          canReply={canComment}
          isAdmin={isAdmin}
          userId={user?.id ?? null}
          run={run}
          onReport={(comment) => setReporting({ type: 'forum_comment', id: comment.id, label: 'this comment' })}
          postId={post.id}
        />
      </section>

      <ReportDialog
        open={reporting != null}
        targetType={reporting?.type ?? 'forum_post'}
        targetId={reporting?.id ?? ''}
        targetLabel={reporting?.label ?? ''}
        onClose={() => setReporting(null)}
      />
    </main>
  );
}

function PostEditor({ post, onCancel, onSave }: {
  post: ForumPost;
  onCancel: () => void;
  onSave: (title: string, body: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="forum-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        await onSave(title, body);
        setBusy(false);
      }}
    >
      <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} aria-label="Title" />
      <textarea value={body} maxLength={10000} rows={8} onChange={(event) => setBody(event.target.value)} aria-label="Post" />
      <div className="forum-editor__actions">
        <button className="button button--secondary button--small" type="button" onClick={onCancel}>Cancel</button>
        <button className="button button--primary button--small" type="submit" disabled={busy || title.trim().length < 3}>Save</button>
      </div>
    </form>
  );
}

function CommentForm({ placeholder, initial = '', submitLabel = 'Comment', onSubmit, onCancel }: {
  placeholder: string;
  initial?: string;
  submitLabel?: string;
  onSubmit: (body: string) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const ok = await onSubmit(body);
    setBusy(false);
    if (ok) {
      setBody('');
      onCancel?.();
    }
  }

  return (
    <form className="forum-comment-form" onSubmit={handleSubmit}>
      <textarea
        value={body}
        rows={3}
        maxLength={5000}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => setBody(event.target.value)}
        autoFocus={Boolean(onCancel)}
      />
      <div className="forum-editor__actions">
        {onCancel && <button className="button button--secondary button--small" type="button" onClick={onCancel}>Cancel</button>}
        <button className="button button--primary button--small" type="submit" disabled={busy || !body.trim()}>
          {busy ? 'Posting…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

function CommentList({ parentId, tree, ...shared }: {
  parentId: string | null;
  tree: Map<string | null, ForumComment[]>;
  canReply: boolean;
  isAdmin: boolean;
  userId: string | null;
  postId: string;
  run: (action: () => Promise<{ error: string | null }>) => Promise<boolean>;
  onReport: (comment: ForumComment) => void;
}) {
  const children = tree.get(parentId) ?? [];
  if (children.length === 0) return null;

  return (
    <ul className={parentId ? 'forum-comment-children' : 'forum-comment-list'}>
      {children.map((comment) => (
        <CommentItem key={comment.id} comment={comment} tree={tree} {...shared} />
      ))}
    </ul>
  );
}

function CommentItem({ comment, tree, canReply, isAdmin, userId, postId, run, onReport }: {
  comment: ForumComment;
  tree: Map<string | null, ForumComment[]>;
  canReply: boolean;
  isAdmin: boolean;
  userId: string | null;
  postId: string;
  run: (action: () => Promise<{ error: string | null }>) => Promise<boolean>;
  onReport: (comment: ForumComment) => void;
}) {
  const [mode, setMode] = useState<'view' | 'reply' | 'edit'>('view');
  const [collapsed, setCollapsed] = useState(comment.authorBlocked);
  const mine = Boolean(userId && comment.author?.userId === userId);

  return (
    <li className="forum-comment">
      <div className="forum-comment__row">
        <VoteButtons
          compact
          score={comment.score}
          myVote={comment.myVote}
          disabled={comment.isDeleted}
          label="comment"
          onVote={(vote) => voteForumComment(comment.id, vote)}
        />
        <div className="forum-comment__main">
          <div className="forum-post-card__meta">
            <AuthorLine post={comment} />
            <button className="text-button text-button--quiet" type="button" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>
              {collapsed ? '[+]' : '[–]'}
            </button>
          </div>

          {collapsed ? (
            <p className="muted forum-comment__collapsed">
              {comment.authorBlocked ? 'Comment from someone you blocked.' : 'Collapsed.'}
            </p>
          ) : mode === 'edit' ? (
            <CommentForm
              placeholder="Edit your comment"
              initial={comment.body}
              submitLabel="Save"
              onCancel={() => setMode('view')}
              onSubmit={(body) => run(() => editForumComment(comment.id, body))}
            />
          ) : (
            <>
              {comment.isDeleted ? (
                <p className="muted">{comment.removedByAdmin ? '[removed by an admin]' : '[deleted]'}</p>
              ) : (
                <div className="forum-body">{comment.body}</div>
              )}

              {!comment.isDeleted && (
                <div className="forum-actions">
                  {canReply && <button className="text-button" type="button" onClick={() => setMode('reply')}>Reply</button>}
                  {mine && <button className="text-button" type="button" onClick={() => setMode('edit')}>Edit</button>}
                  {mine && (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => {
                        if (window.confirm('Delete your comment?')) void run(() => deleteForumComment(comment.id));
                      }}
                    >
                      Delete
                    </button>
                  )}
                  {userId && !mine && <button className="text-button" type="button" onClick={() => onReport(comment)}>Report</button>}
                  {isAdmin && !mine && (
                    <button
                      className="text-button text-button--danger"
                      type="button"
                      onClick={() => {
                        if (window.confirm('Remove this comment as an admin?')) void run(() => adminRemoveForumContent('comment', comment.id));
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}

              {mode === 'reply' && (
                <CommentForm
                  placeholder={`Reply to ${comment.author?.username ?? 'comment'}`}
                  submitLabel="Reply"
                  onCancel={() => setMode('view')}
                  onSubmit={(body) => run(() => createForumComment(postId, comment.id, body))}
                />
              )}
            </>
          )}
        </div>
      </div>

      {!collapsed && (
        <CommentList
          parentId={comment.id}
          tree={tree}
          canReply={canReply}
          isAdmin={isAdmin}
          userId={userId}
          postId={postId}
          run={run}
          onReport={onReport}
        />
      )}
    </li>
  );
}
