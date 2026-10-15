import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BankChecklist } from '../components/BankChecklist';
import { BankCountdown } from '../components/BankCountdown';
import { BankLastChance } from '../components/BankLastChance';
import { RibbonPlanner } from '../components/RibbonPlanner';
import { useAuth } from '../context/AuthContext';
import { useNow } from '../hooks/useNow';
import { bankIsOpen, deadlineInLocalTime } from '../lib/bank';

/** Everything to sort before Pokémon Bank shuts down, in order of panic. */
export function BankPage() {
  const { user, loading } = useAuth();
  const open = bankIsOpen(useNow(60_000));

  useEffect(() => {
    const oldTitle = document.title;
    document.title = 'Bank shutdown · DeviDex';
    return () => { document.title = oldTitle; };
  }, []);

  return (
    <main className="bank-page">
      <section className={`bank-hero${open ? '' : ' is-closed'}`} aria-labelledby="bank-title">
        <div className="bank-hero__text">
          <p className="bank-card__eyebrow">{open ? 'Pokémon Bank closes for good' : 'Pokémon Bank has closed'}</p>
          <h1 id="bank-title">{open ? 'Get them out before the door shuts.' : 'The door has shut.'}</h1>
          <p>
            {open
              ? <>After <strong>{deadlineInLocalTime()}</strong>, nothing in Bank, or in any 3DS, DS or GBA game, can ever reach HOME again.</>
              : <>Bank closed on {deadlineInLocalTime()}. Your lists are kept here as a record of what made it.</>}
          </p>
        </div>
        {open && <BankCountdown seconds size="large" />}
      </section>

      <details className="bank-explainer">
        <summary>How Bank to HOME works, and why it's one-way</summary>
        <div>
          <p>
            Old Pokémon travel along a chain, and <strong>every step only goes forward</strong>: Gen 3 games, then Pal Park into
            Gen 4, then Poké Transfer into Gen 5, then Poké Transporter into Bank, then Bank into HOME. Gen 6 and Gen 7 games
            deposit into Bank directly.
          </p>
          <p>
            HOME never sends anything back to Bank. So any ribbon, contest or battle facility from those older games has to be
            finished <strong>before</strong> the Pokémon makes the jump. That's what the warnings below are for.
          </p>
          <p>
            Bank moves Pokémon a box at a time. Poké Miles in Bank don't carry over. And once the deadline passes, Bank and
            Poké Transporter both stop working, so a Pokémon still sitting in either is stuck there for good.
          </p>
        </div>
      </details>

      <nav className="bank-jump" aria-label="On this page">
        <a href="#still-in-bank">Still in Bank</a>
        <a href="#ribbon-masters">Ribbon Masters</a>
        <a href="#last-chance">Last chance</a>
      </nav>

      {loading ? null : user ? (
        <>
          <BankChecklist />
          <RibbonPlanner />
        </>
      ) : (
        <section className="bank-section bank-guest" id="still-in-bank" aria-labelledby="guest-title">
          <h2 id="guest-title">Your checklist and Ribbon Master plans</h2>
          <p className="muted">
            Track every Pokémon still in Bank, mark which ones are waiting on ribbons, and plan Ribbon Masters with each
            one-way transfer locked until it's safe. These save to your account, so you'll need one.
          </p>
          <div className="bank-guest__actions">
            <Link className="button button--primary" to="/login">Sign in or create an account</Link>
          </div>
          <span id="ribbon-masters" />
        </section>
      )}

      <BankLastChance />
    </main>
  );
}
