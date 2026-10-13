import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import {
  blockUser,
  getMyFriends,
  getRelationship,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
  unblockUser,
  type ProfileRelationship,
} from '../lib/social';
import { ReportDialog } from './ReportDialog';

/** Friend / message / block / report buttons shown on a public profile. */
export function ProfileSocialActions({ username }: { username: string }) {
  const { user, profile } = useAuth();
  const { refreshCounts } = useSocial();
  const [relationship, setRelationship] = useState<ProfileRelationship | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const result = await getRelationship(username);
    setRelationship(result.data?.relationship ?? null);
    setTargetId(result.data?.userId ?? null);
  }, [user, username]);

  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<{ error: string | null }>) {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (result.error) setMessage(result.error);
    await load();
    void refreshCounts();
  }

  async function acceptIncoming() {
    const friends = await getMyFriends();
    const request = friends.data.find((entry) => entry.userId === targetId && entry.relationship === 'incoming');
    if (!request) return { error: 'That request no longer exists.' };
    return respondToFriendRequest(request.friendshipId, true);
  }

  if (!user) {
    return (
      <div className="profile-social-actions">
        <Link className="button button--secondary" to="/login">Sign in to add @{username}</Link>
      </div>
    );
  }

  if (!relationship || relationship === 'self' || !targetId) return null;

  const id = targetId;

  return (
    <div className="profile-social-actions">
      {relationship === 'none' && (
        profile?.username ? (
          <button className="button button--primary" type="button" disabled={busy} onClick={() => void run(() => sendFriendRequest(username))}>
            Add friend
          </button>
        ) : (
          <Link className="button button--primary" to="/account">Pick a username to add friends</Link>
        )
      )}
      {relationship === 'outgoing' && (
        <button className="button button--secondary" type="button" disabled={busy} onClick={() => void run(() => removeFriend(id))}>
          Request sent · Cancel
        </button>
      )}
      {relationship === 'incoming' && (
        <button className="button button--primary" type="button" disabled={busy} onClick={() => void run(acceptIncoming)}>
          Accept friend request
        </button>
      )}
      {relationship === 'friend' && (
        <>
          <Link className="button button--primary" to={`/chat?with=${encodeURIComponent(username)}`}>Message</Link>
          <Link className="button button--secondary" to={`/friends/${encodeURIComponent(username)}`}>Compare & trade</Link>
        </>
      )}
      {relationship === 'blocked' ? (
        <button className="button button--secondary" type="button" disabled={busy} onClick={() => void run(() => unblockUser(id))}>
          Unblock
        </button>
      ) : (
        <details className="social-menu">
          <summary aria-label={`More options for @${username}`}>•••</summary>
          <div>
            {relationship === 'friend' && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Remove @${username} from your friends?`)) void run(() => removeFriend(id));
                }}
              >
                Remove friend
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Block @${username}? They won't be able to message you or send requests. They are not told.`)) {
                  void run(() => blockUser(id));
                }
              }}
            >
              Block
            </button>
            <button type="button" onClick={() => setReporting(true)}>Report</button>
          </div>
        </details>
      )}

      {message && <p className="form-message form-message--error">{message}</p>}

      <ReportDialog
        open={reporting}
        targetType="user"
        targetId={id}
        targetLabel={`@${username}`}
        onClose={() => setReporting(false)}
      />
    </div>
  );
}
