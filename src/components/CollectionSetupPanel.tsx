import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFormPreferences } from '../context/FormPreferencesContext';
import type { CollectionGoal, FormCategory, FormPreferences } from '../types';

type OptionalCategory = Exclude<FormCategory, 'default'>;

const OPTIONAL: OptionalCategory[] = ['regional', 'alternate', 'pattern', 'gender', 'battle', 'special'];

const CATEGORY_LABEL: Record<OptionalCategory, string> = {
  regional: 'Regional forms',
  alternate: 'Alternate forms',
  pattern: 'Patterns (Vivillon, Unown…)',
  gender: 'Female forms',
  battle: 'Megas & G-Max',
  special: 'Costumes & Totems',
};

/** Four steps, each adding to the last. Covers what almost everyone wants. */
const LEVELS: Array<{ id: string; label: string; summary: string; hint: string; includes: OptionalCategory[] }> = [
  { id: 'species', label: 'Species only', summary: 'Species only', hint: 'One of each Pokémon', includes: [] },
  { id: 'forms', label: '+ Forms', summary: 'Species + forms', hint: 'Regional, alternate, patterns', includes: ['regional', 'alternate', 'pattern'] },
  { id: 'female', label: '+ Female forms', summary: 'Forms + female forms', hint: 'Combee, Pikachu, Hippowdon…', includes: ['regional', 'alternate', 'pattern', 'gender'] },
  { id: 'everything', label: 'Everything', summary: 'Everything', hint: 'Plus Megas, G-Max, costumes', includes: OPTIONAL },
];

const GOALS: Array<{ id: CollectionGoal; label: string }> = [
  { id: 'living', label: 'Normal' },
  { id: 'shiny', label: 'Shiny' },
  { id: 'both', label: 'Both' },
];

function prefsFor(includes: OptionalCategory[]): FormPreferences {
  return Object.fromEntries(OPTIONAL.map((category) => [category, includes.includes(category)])) as unknown as FormPreferences;
}

function levelFor(preferences: FormPreferences) {
  return LEVELS.find((level) => OPTIONAL.every((category) => preferences[category] === level.includes.includes(category))) ?? null;
}

type CollectionSetupPanelProps = {
  /** How many slots each form category has (in this Dex or game). */
  categoryCounts: Partial<Record<FormCategory, number>>;
  completionByCollection?: Record<string, { percent: number; current: number; total: number }>;
  /** Shown under the choices on game pages. */
  formsNote?: string;
};

/**
 * "What counts" in two questions: which Pokémon, and normal or shiny.
 * Changing it never touches ticked Pokémon.
 */
export function CollectionSetupPanel({ categoryCounts, completionByCollection = {}, formsNote }: CollectionSetupPanelProps) {
  const { user } = useAuth();
  const {
    preferences,
    collections,
    activeCollection,
    goal,
    loading,
    saving,
    saveError,
    setGoal,
    setPreference,
    setAllPreferences,
    createCollection,
    activateCollection,
    renameActiveCollection,
    deleteCollection,
  } = useFormPreferences();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(activeCollection?.name ?? '');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setRenameValue(activeCollection?.name ?? ''), [activeCollection?.id, activeCollection?.name]);

  const level = levelFor(preferences);
  const slotsFor = (includes: OptionalCategory[]) =>
    (categoryCounts.default ?? 0) + includes.reduce((sum, category) => sum + (categoryCounts[category] ?? 0), 0);
  const scopeLabel = level?.summary ?? 'Custom forms';
  const goalLabel = goal === 'shiny' ? 'shiny' : goal === 'both' ? 'normal + shiny' : 'normal';
  const busy = loading || saving;

  async function run(action: () => Promise<unknown>, success: string) {
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Something went wrong.');
    }
  }

  return (
    <section className={`setup${open ? ' is-open' : ''}`} aria-label="What counts in this Dex">
      <div className="setup__bar">
        <p>
          {activeCollection && collections.length > 1 && <strong>{activeCollection.name}</strong>}
          <span className="setup__summary">
            <b>{scopeLabel}</b> · {goalLabel}
          </span>
        </p>
        <button className="button button--secondary button--small" type="button" aria-expanded={open} aria-controls="setup-panel" onClick={() => setOpen((value) => !value)}>
          {open ? 'Done' : 'Change'}
        </button>
      </div>

      {open && (
        <div className="setup__panel" id="setup-panel">
          <div className="setup__row">
            <h3 className="setup__q">Which Pokémon count?</h3>
            <div className="setup__levels" role="radiogroup" aria-label="Which Pokémon count">
              {LEVELS.map((item) => {
                const selected = level?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`setup__level${selected ? ' is-selected' : ''}`}
                    disabled={busy}
                    onClick={() => void setAllPreferences(prefsFor(item.includes))}
                  >
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                    <em>{slotsFor(item.includes).toLocaleString()} slots</em>
                  </button>
                );
              })}
            </div>
            {formsNote && <p className="setup__note">{formsNote}</p>}

            <details className="setup__fine" open={!level || undefined}>
              <summary>{level ? 'Pick form types yourself' : 'Custom: your form types'}</summary>
              <div className="setup__chips">
                {OPTIONAL.map((category) => {
                  const count = categoryCounts[category] ?? 0;
                  const on = preferences[category];
                  return (
                    <button
                      key={category}
                      type="button"
                      className={`setup__chip${on ? ' is-on' : ''}`}
                      aria-pressed={on}
                      disabled={busy || count === 0}
                      title={count === 0 ? 'None in this Dex' : undefined}
                      onClick={() => void setPreference(category, !on)}
                    >
                      {on ? '✓ ' : ''}{CATEGORY_LABEL[category]} <span>{count}</span>
                    </button>
                  );
                })}
              </div>
            </details>
          </div>

          <div className="setup__row">
            <h3 className="setup__q">Normal or shiny?</h3>
            <div className="segmented" role="radiogroup" aria-label="Goal">
              {GOALS.map((item) => (
                <button key={item.id} type="button" role="radio" aria-checked={goal === item.id} className={goal === item.id ? 'is-active' : undefined} disabled={busy} onClick={() => void setGoal(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {user ? (
            <div className="setup__row">
              <h3 className="setup__q">Saved setups <span>Switch between, say, a Living Dex and a Shiny Dex. Ticks are shared.</span></h3>
              <div className="setup__saved">
                {collections.map((collection) => (
                  <span key={collection.id} className={`setup__setup${collection.isActive ? ' is-active' : ''}`}>
                    <button type="button" disabled={busy || collection.isActive} aria-pressed={collection.isActive} onClick={() => void activateCollection(collection.id)}>
                      {collection.name}
                      <small>{completionByCollection[collection.id]?.percent ?? 0}%</small>
                    </button>
                    {!collection.isActive && (
                      <button
                        type="button"
                        className="setup__remove"
                        aria-label={`Delete ${collection.name}`}
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Delete the setup “${collection.name}”? Ticked Pokémon are not affected.`)) {
                            void run(() => deleteCollection(collection.id), 'Setup deleted. Your Pokémon were left alone.');
                          }
                        }}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}

                {creating ? (
                  <form className="setup__inline" onSubmit={(event) => { event.preventDefault(); void run(async () => { await createCollection(newName); setNewName(''); setCreating(false); }, 'Saved and switched to it.'); }}>
                    <input autoFocus value={newName} maxLength={40} placeholder="Name, e.g. Shiny Dex" aria-label="New setup name" disabled={saving} onChange={(event) => setNewName(event.target.value)} />
                    <button className="button button--primary button--small" type="submit" disabled={saving || !newName.trim()}>Save</button>
                    <button className="text-button" type="button" onClick={() => setCreating(false)}>Cancel</button>
                  </form>
                ) : (
                  <button className="setup__add" type="button" disabled={busy} onClick={() => { setCreating(true); setRenaming(false); }}>+ Save as new</button>
                )}
              </div>

              {activeCollection && (
                renaming ? (
                  <form className="setup__inline" onSubmit={(event) => { event.preventDefault(); void run(async () => { await renameActiveCollection(renameValue); setRenaming(false); }, 'Renamed.'); }}>
                    <input autoFocus value={renameValue} maxLength={40} aria-label="Setup name" disabled={saving} onChange={(event) => setRenameValue(event.target.value)} />
                    <button className="button button--secondary button--small" type="submit" disabled={saving || !renameValue.trim() || renameValue.trim() === activeCollection.name}>Rename</button>
                    <button className="text-button" type="button" onClick={() => setRenaming(false)}>Cancel</button>
                  </form>
                ) : (
                  <button className="text-button setup__rename" type="button" onClick={() => { setRenaming(true); setCreating(false); }}>Rename “{activeCollection.name}”</button>
                )
              )}
            </div>
          ) : (
            <p className="setup__note">This lasts until you close the tab. <Link to="/login">Sign in</Link> to keep it.</p>
          )}

          {(saveError || message) && (
            <p className={`form-message${saveError ? ' form-message--error' : ''}`} role="status">{saveError ?? message}</p>
          )}
        </div>
      )}
    </section>
  );
}
