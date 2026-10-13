import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ReportDialog } from '../components/ReportDialog';
import { UserAvatar } from '../components/UserAvatar';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import {
  blockUser,
  getMyBlockedUsers,
  getMyFriends,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
  socialName,
  timeAgo,
  unblockUser,
  type BlockedUser,
  type FriendEntry,
} from '../lib/social';

const OUTCOME_MESSAGES = {
  requested: 'Request sent.',
  accepted: 'They had already asked you, so you are now friends.',
  already_requested: 'You already sent them a request.',
  already_friends: 'You are already friends.',
} as const;

export function FriendsPage() {
  const { profile } = useAuth();
  const { refreshCounts } = useSocial();
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reporting, setReporting] = useState<FriendEntry | null>(null);

  const load = useCallback(async () => {
    const [friendResult, blockedResult] = await Promise.all([getMyFriends(), getMyBlockedUsers()]);
    setError(friendResult.error ?? blockedResult.error);
    setFriends(friendResult.data);
    setBlocked(blockedResult.data);
    setLoading(false);
    void refreshCounts();
  }, [refreshCounts]);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!username.trim()) return;
    setBusyId('add');
    const result = await sendFriendRequest(username);
    setBusyId(null);
    if (result.error) {
      setNotice({ text: result.error, tone: 'error' });
      return;
    }
    setNotice({ text: result.data ? OUTCOME_MESSAGES[result.data] : 'Done.', tone: 'info' });
    setUsername('');
    await load();
  }

  async function act(id: string, action: () => Promise<{ error: string | null }>) {
    setBusyId(id);
    const result = await action();
    setBusyId(null);
    if (result.error) setNotice({ text: result.error, tone: 'error' });
    await load();
  }

  function confirmRemove(friend: FriendEntry) {
    if (window.confirm(`Remove @${friend.username} from your friends? You can send a new request later.`)) {
      void act(friend.userId, () => removeFriend(friend.userId));
    }
  }

  function confirmBlock(friend: FriendEntry) {
    if (window.confirm(`Block @${friend.username}? This removes them as a friend, and they won't be able to message you or send requests. They are not told.`)) {
      void act(friend.userId, () => blockUser(friend.userId));
    }
  }

  const accepted = friends.filter((friend) => friend.relationship === 'friend');
  const incoming = friends.filter((friend) => friend.relationship === 'incoming');
  const outgoing = friends.filter((friend) => friend.relationship === 'outgoing');

  if (!profile?.username) {
    return (
      <main className="social-page">
        <section className="dex-empty-state">
          <strong>Pick a username first.</strong>
          <p>Friends find each other by username, so you need one before you can add anyone.</p>
          <Link className="button button--primary" to="/account">Set up your profile</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="social-page">
      <section className="social-hero">
        <div>
          <p className="eyebrow">FRIENDS</p>
          <h1>Your collecting crew.</h1>
          <p className="muted">
            Add friends by username to chat, compare collections and find trades. Your friends see you
            as <strong>@{profile.username}</strong>.
          </p>
        </div>
        <form className="social-add-form" onSubmit={handleAdd}>
          <label htmlFor="friend-username">Add a friend</label>
          <div>
            <input
              id="friend-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="username"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={21}
            />
            <button className="button button--primary" type="submit" disabled={busyId === 'add' || !username.trim()}>
              {busyId === 'add' ? 'Sending…' : 'Send request'}
            </button>
          </div>
          {notice && (
            <p className={`form-message${notice.tone === 'error' ? ' form-message--error' : ''}`} role="status">
              {notice.text}
            </p>
          )}
        </form>
      </section>

      {error && <section className="dex-empty-state dex-empty-state--error"><strong>{error}</strong></section>}

      {incoming.length > 0 && (
        <section className="social-section">
          <h2>Requests for you <span className="social-count">{incoming.length}</span></h2>
          <ul className="social-list">
            {incoming.map((friend) => (
              <li key={friend.friendshipId} className="social-row social-row--highlight">
                <PersonSummary person={friend} detail={`Asked ${timeAgo(friend.since)}`} />
                <div className="social-row__actions">
                  <button
                    className="button button--primary button--small"
                    type="button"
                    disabled={busyId === friend.userId}
                    onClick={() => void act(friend.userId, () => respondToFriendRequest(friend.friendshipId, true))}
                  >
                    Accept
                  </button>
                  <button
                    className="button button--secondary button--small"
                    type="button"
                    disabled={busyId === friend.userId}
                    onClick={() => void act(friend.userId, () => respondToFriendRequest(friend.friendshipId, false))}
                  >
                    Decline
                  </button>
                  <button className="text-button text-button--quiet" type="button" onClick={() => confirmBlock(friend)}>
                    Block
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="social-section">
        <h2>Friends <span className="social-count">{accepted.length}</span></h2>
        {loading ? (
          <p className="muted">Loading your friends…</p>
        ) : accepted.length === 0 ? (
          <div className="social-empty">
            <strong>No friends yet.</strong>
            <span>Send a request with their username above. Once they accept, you can chat and compare collections.</span>
          </div>
        ) : (
          <ul className="social-list">
            {accepted.map((friend) => (
              <li key={friend.friendshipId} className="social-row">
                <PersonSummary person={friend} detail={`Friends since ${timeAgo(friend.since)}`} />
                <div className="social-row__actions">
                  <Link className="button button--primary button--small" to={`/chat?with=${encodeURIComponent(friend.username)}`}>
                    Message
                  </Link>
                  <Link className="button button--secondary button--small" to={`/friends/${encodeURIComponent(friend.username)}`}>
                    Compare & trade
                  </Link>
                  <details className="social-menu">
                    <summary aria-label={`More options for @${friend.username}`}>•••</summary>
                    <div>
                      <button type="button" onClick={() => confirmRemove(friend)}>Remove friend</button>
                      <button type="button" onClick={() => confirmBlock(friend)}>Block</button>
                      <button type="button" onClick={() => setReporting(friend)}>Report</button>
                    </div>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {outgoing.length > 0 && (
        <section className="social-section">
          <h2>Waiting on them <span className="social-count">{outgoing.length}</span></h2>
          <ul className="social-list">
            {outgoing.map((friend) => (
              <li key={friend.friendshipId} className="social-row">
                <PersonSummary person={friend} detail={`Sent ${timeAgo(friend.since)}`} />
                <div className="social-row__actions">
                  <button
                    className="button button--secondary button--small"
                    type="button"
                    disabled={busyId === friend.userId}
                    onClick={() => void act(friend.userId, () => removeFriend(friend.userId))}
                  >
                    Cancel request
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {blocked.length > 0 && (
        <section className="social-section">
          <details className="social-blocked">
            <summary><h2>Blocked <span className="social-count">{blocked.length}</span></h2></summary>
            <ul className="social-list">
              {blocked.map((person) => (
                <li key={person.userId} className="social-row">
                  <PersonSummary person={person} detail={`Blocked ${timeAgo(person.blockedAt)}`} link={false} />
                  <div className="social-row__actions">
                    <button
                      className="button button--secondary button--small"
                      type="button"
                      disabled={busyId === person.userId}
                      onClick={() => void act(person.userId, () => unblockUser(person.userId))}
                    >
                      Unblock
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      {reporting && (
        <ReportDialog
          open
          targetType="user"
          targetId={reporting.userId}
          targetLabel={`@${reporting.username}`}
          onClose={() => setReporting(null)}
        />
      )}
    </main>
  );
}

function PersonSummary({ person, detail, link = true }: {
  person: FriendEntry | BlockedUser;
  detail: string;
  link?: boolean;
}) {
  const name = (
    <>
      <strong>{socialName(person)}</strong>
      <span className="muted">@{person.username} · {detail}</span>
    </>
  );

  return (
    <div className="social-person">
      <UserAvatar user={person} />
      {link ? <Link to={`/u/${encodeURIComponent(person.username)}`}>{name}</Link> : <div>{name}</div>}
    </div>
  );
}
