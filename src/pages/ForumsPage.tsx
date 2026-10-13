import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, useParams, useSearchParams } from 'react-router-dom';
import { UserAvatar } from '../components/UserAvatar';
import { VoteButtons } from '../components/VoteButtons';
import { useAuth } from '../context/AuthContext';
import {
  FORUM_PAGE_SIZE,
  listForumCategories,
  listForumPosts,
  voteForumPost,
  type ForumCategory,
  type ForumPost,
  type ForumSort,
} from '../lib/forums';
import { socialName, timeAgo } from '../lib/social';

const SORTS: Array<{ value: ForumSort; label: string }> = [
  { value: 'hot', label: 'Hot' },
  { value: 'new', label: 'New' },
  { value: 'top', label: 'Top' },
];

/** /forums (everything) and /forums/:category. */
export function ForumsPage() {
  const { category = null } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const sort = (SORTS.some((option) => option.value === searchParams.get('sort')) ? searchParams.get('sort') : 'hot') as ForumSort;
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listForumCategories().then((result) => setCategories(result.data));
  }, []);

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    const result = await listForumPosts(category, sort, nextPage);
    setPosts((current) => (nextPage === 0 ? result.data : [...current, ...result.data]));
    setHasMore(result.data.length === FORUM_PAGE_SIZE);
    setPage(nextPage);
    setError(result.error);
    setLoading(false);
  }, [category, sort]);

  useEffect(() => { void load(0); }, [load]);

  const current = categories.find((entry) => entry.slug === category);
  const newPostLink = `/forums/new${category && !current?.adminOnlyPosts ? `?category=${category}` : ''}`;

  return (
    <main className="forum-page">
      <aside className="forum-sidebar" aria-label="Forums">
        <nav>
          <NavLink end to="/forums">All posts</NavLink>
          {categories.map((entry) => (
            <NavLink key={entry.slug} to={`/forums/${entry.slug}`}>
              <span>{entry.name}</span>
              <small>{entry.postCount}</small>
            </NavLink>
          ))}
        </nav>
      </aside>

      <section className="forum-feed">
        <header className="forum-feed__header">
          <div>
            <p className="eyebrow">{current ? 'FORUM' : 'FORUMS'}</p>
            <h1>{current?.name ?? 'Community'}</h1>
            <p className="muted">{current?.description ?? 'Trades, hunts, showcases and help from other collectors.'}</p>
          </div>
          {user ? (
            <Link className="button button--primary" to={newPostLink}>New post</Link>
          ) : (
            <Link className="button button--secondary" to="/login">Sign in to post</Link>
          )}
        </header>

        <div className="segmented forum-sorts" role="group" aria-label="Sort posts">
          {SORTS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={sort === option.value ? 'is-active' : undefined}
              onClick={() => setSearchParams(option.value === 'hot' ? {} : { sort: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>

        {error && <p className="form-message form-message--error">{error}</p>}

        {!loading && posts.length === 0 ? (
          <div className="social-empty">
            <strong>No posts yet.</strong>
            <span>{user ? 'Be the first.' : 'Sign in to start the conversation.'}</span>
          </div>
        ) : (
          <ul className="forum-post-list">
            {posts.map((post) => <PostCard key={post.id} post={post} showCategory={!category} />)}
          </ul>
        )}

        {loading && <p className="muted">Loading posts…</p>}
        {hasMore && !loading && (
          <button className="button button--secondary" type="button" onClick={() => void load(page + 1)}>Load more</button>
        )}
      </section>
    </main>
  );
}

function PostCard({ post, showCategory }: { post: ForumPost; showCategory: boolean }) {
  if (post.authorBlocked) {
    return (
      <li className="forum-post-card forum-post-card--hidden">
        <span className="muted">Post from someone you blocked.</span>
        <Link className="text-button" to={`/forums/post/${post.id}`}>Show anyway</Link>
      </li>
    );
  }

  const snippet = post.body.length > 220 ? `${post.body.slice(0, 220).trimEnd()}…` : post.body;

  return (
    <li className={`forum-post-card${post.isPinned ? ' is-pinned' : ''}`}>
      <VoteButtons
        score={post.score}
        myVote={post.myVote}
        label={post.title}
        onVote={(vote) => voteForumPost(post.id, vote)}
      />
      <div className="forum-post-card__main">
        <div className="forum-post-card__meta">
          {post.isPinned && <span className="forum-tag forum-tag--pinned">Pinned</span>}
          {post.isLocked && <span className="forum-tag">Locked</span>}
          {showCategory && <Link className="forum-tag forum-tag--category" to={`/forums/${post.categorySlug}`}>{post.categoryName}</Link>}
          <AuthorLine post={post} />
        </div>
        <Link className="forum-post-card__title" to={`/forums/post/${post.id}`}>{post.title}</Link>
        {snippet && <p className="forum-post-card__snippet">{snippet}</p>}
        <Link className="forum-post-card__comments" to={`/forums/post/${post.id}`}>
          {post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}
        </Link>
      </div>
    </li>
  );
}

export function AuthorLine({ post }: { post: Pick<ForumPost, 'author' | 'createdAt' | 'editedAt'> }) {
  return (
    <span className="forum-author">
      {post.author ? (
        <>
          <UserAvatar user={post.author} size="sm" />
          <Link to={`/u/${encodeURIComponent(post.author.username)}`}>{socialName(post.author)}</Link>
          {post.author.isAdmin && <span className="forum-tag forum-tag--admin">Admin</span>}
        </>
      ) : (
        <span className="muted">[deleted]</span>
      )}
      <span className="muted">· {timeAgo(post.createdAt)}{post.editedAt ? ' · edited' : ''}</span>
    </span>
  );
}
