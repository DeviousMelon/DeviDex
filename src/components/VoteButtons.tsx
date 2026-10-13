import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Result } from '../lib/social';
import type { Vote } from '../lib/forums';

type VoteButtonsProps = {
  score: number;
  myVote: Vote;
  disabled?: boolean;
  compact?: boolean;
  label: string;
  onVote: (vote: Vote) => Promise<Result<number | null>>;
};

/** Up/down arrows with an optimistic score that settles on the server's value. */
export function VoteButtons({ score, myVote, disabled = false, compact = false, label, onVote }: VoteButtonsProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState({ score, myVote });
  const [busy, setBusy] = useState(false);

  // A reload from the server wins over whatever this button last showed.
  useEffect(() => setState({ score, myVote }), [score, myVote]);

  async function cast(direction: 1 | -1) {
    if (!user) {
      navigate('/login');
      return;
    }
    if (busy || disabled) return;
    const next: Vote = state.myVote === direction ? 0 : direction;
    const previous = state;
    setState({ score: state.score + next - state.myVote, myVote: next });
    setBusy(true);
    const result = await onVote(next);
    setBusy(false);
    if (result.error || result.data == null) setState(previous);
    else setState({ score: result.data, myVote: next });
  }

  return (
    <div className={`vote-buttons${compact ? ' vote-buttons--compact' : ''}`} aria-label={`Votes for ${label}`}>
      <button
        type="button"
        className={state.myVote === 1 ? 'is-up' : undefined}
        aria-pressed={state.myVote === 1}
        aria-label="Upvote"
        disabled={disabled}
        onClick={() => void cast(1)}
      >
        ▲
      </button>
      <strong className={state.myVote === 1 ? 'is-up' : state.myVote === -1 ? 'is-down' : undefined}>{state.score}</strong>
      <button
        type="button"
        className={state.myVote === -1 ? 'is-down' : undefined}
        aria-pressed={state.myVote === -1}
        aria-label="Downvote"
        disabled={disabled}
        onClick={() => void cast(-1)}
      >
        ▼
      </button>
    </div>
  );
}
