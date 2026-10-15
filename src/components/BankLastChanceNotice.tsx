import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNow } from '../hooks/useNow';
import { bankIsOpen, getLastChanceForPokemon, type LastChanceEntry } from '../lib/bank';

/** "Only before Bank closes" callout on a Pokémon's page, when an admin has flagged it. */
export function BankLastChanceNotice({ speciesId, formIds }: { speciesId: number; formIds: number[] }) {
  const open = bankIsOpen(useNow(60_000));
  const [entries, setEntries] = useState<LastChanceEntry[]>([]);
  const formKey = formIds.join(',');

  useEffect(() => {
    let active = true;
    const ids = formKey ? formKey.split(',').map(Number) : [];
    void getLastChanceForPokemon(speciesId, ids).then((result) => {
      if (active) setEntries(result.data);
    });
    return () => { active = false; };
  }, [speciesId, formKey]);

  if (!open || entries.length === 0) return null;

  return (
    <aside className="bank-notice" aria-label="Pokémon Bank shutdown">
      <strong>Only before Pokémon Bank closes</strong>
      <ul>
        {entries.map((entry) => <li key={entry.id}>{entry.title}</li>)}
      </ul>
      <Link to="/bank#last-chance">What to do before the deadline</Link>
    </aside>
  );
}
