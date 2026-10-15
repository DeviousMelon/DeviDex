import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNow } from '../hooks/useNow';
import { bankIsOpen, deadlineInLocalTime, getBankPrepSummary, timeLeft, type BankPrepSummary } from '../lib/bank';

const pad = (value: number) => String(value).padStart(2, '0');

/** Days, hours, minutes (and optionally seconds) until Bank closes. */
export function BankCountdown({ seconds = false, size = 'regular' }: { seconds?: boolean; size?: 'regular' | 'large' }) {
  const now = useNow(seconds ? 1000 : 30_000);
  const left = timeLeft(now);
  const units: Array<[string, string]> = [
    [String(left.days), left.days === 1 ? 'day' : 'days'],
    [pad(left.hours), 'hrs'],
    [pad(left.minutes), 'min'],
  ];
  if (seconds) units.push([pad(left.seconds), 'sec']);

  return (
    <div className={`bank-countdown bank-countdown--${size}`} role="timer" aria-label={`${left.days} days, ${left.hours} hours and ${left.minutes} minutes until Pokémon Bank closes`}>
      {units.map(([value, unit]) => (
        <span key={unit} className="bank-countdown__unit" aria-hidden="true">
          <strong>{value}</strong>
          <small>{unit}</small>
        </span>
      ))}
    </div>
  );
}

/** Front-page card. Signed-in users also see what they still have to do. */
export function BankPrepCard() {
  const { user } = useAuth();
  const now = useNow(60_000);
  const [summary, setSummary] = useState<BankPrepSummary | null>(null);
  const open = bankIsOpen(now);

  useEffect(() => {
    if (!user) {
      setSummary(null);
      return;
    }
    void getBankPrepSummary().then((result) => setSummary(result.data));
  }, [user]);

  if (!open) {
    return (
      <section className="bank-card bank-card--closed" aria-labelledby="bank-card-title">
        <div>
          <p className="bank-card__eyebrow">Pokémon Bank</p>
          <h2 id="bank-card-title">Bank has closed.</h2>
          <p>Anything that made it to HOME before the deadline is now one of a kind.</p>
        </div>
        <Link className="button button--secondary" to="/bank">See what made it</Link>
      </section>
    );
  }

  const todo = summary ? summary.stillToMove + summary.activePlans : 0;

  return (
    <section className="bank-card" aria-labelledby="bank-card-title">
      <div className="bank-card__text">
        <p className="bank-card__eyebrow">Pokémon Bank closes for good</p>
        <h2 id="bank-card-title">Get your old Pokémon out before the door shuts.</h2>
        <p className="bank-card__when">{deadlineInLocalTime()}</p>
        {summary && todo > 0 && (
          <ul className="bank-card__todo">
            {summary.stillToMove > 0 && (
              <li><strong>{summary.stillToMove}</strong> still to move{summary.heldForRibbons > 0 && <>, <strong>{summary.heldForRibbons}</strong> waiting on ribbons</>}</li>
            )}
            {summary.activePlans > 0 && <li><strong>{summary.activePlans}</strong> Ribbon Master {summary.activePlans === 1 ? 'plan' : 'plans'} in progress</li>}
          </ul>
        )}
        {summary && todo === 0 && summary.moved > 0 && (
          <p className="bank-card__done">Everything on your checklist is in HOME. Nice.</p>
        )}
      </div>
      <div className="bank-card__side">
        <BankCountdown />
        <Link className="button button--primary" to="/bank">{user ? 'Open your Bank checklist' : 'What do I need to do?'}</Link>
      </div>
    </section>
  );
}
