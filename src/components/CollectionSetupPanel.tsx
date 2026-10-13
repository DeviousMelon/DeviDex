import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { COLLECTION_PRESETS, useFormPreferences } from '../context/FormPreferencesContext';
import { collectionGoalLabel } from '../lib/collectionPresets';
import type { CollectionGoal, FormCategory, FormPreferences } from '../types';

type OptionalCategory = Exclude<FormCategory, 'default'>;

const goals: Array<{ id: CollectionGoal; label: string }> = [
  { id: 'living', label: 'Living' },
  { id: 'shiny', label: 'Shiny' },
  { id: 'both', label: 'Living + shiny' },
];

const CATEGORY_COPY: Record<OptionalCategory, { label: string; description: string }> = {
  regional: { label: 'Regional forms', description: 'Alolan, Galarian, Hisuian, Paldean' },
  alternate: { label: 'Alternate forms', description: 'Other lasting non-default forms' },
  pattern: { label: 'Patterns & sets', description: 'Vivillon patterns, Unown letters' },
  gender: { label: 'Gender differences', description: 'Visible female variants' },
  battle: { label: 'Battle-only stand-ins', description: 'Megas, G-Max and similar' },
  special: { label: 'Special & cosmetic', description: 'Costumes, caps, Totems' },
};

const OPTIONAL: OptionalCategory[] = ['regional', 'alternate', 'pattern', 'gender', 'battle', 'special'];

type CollectionSetupPanelProps = {
  /** How many slots each form category has (in this Dex or game). */
  categoryCounts: Partial<Record<FormCategory, number>>;
  completionByCollection?: Record<string, { percent: number; current: number; total: number }>;
  /** Shown under "Forms that count" on game pages. */
  formsNote?: string;
};

/**
 * One line that says what you are collecting, with everything that changes it
 * (presets, goal, form rules, saved setups) one click away. Changing any of it
 * never touches ticked Pokémon.
 */
export function CollectionSetupPanel({ categoryCounts, completionByCollection = {}, formsNote }: CollectionSetupPanelProps) {
  const { user } = useAuth();
  const {
    preferences,
    collections,
    activeCollection,
    presetId,
    goal,
    loading,
    saving,
    saveError,
    applyPreset,
    setGoal,
    setPreference,
    resetPreferences,
    createCollection,
    activateCollection,
    renameActiveCollection,
    deleteCollection,
  } = useFormPreferences();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameValue, setRenameValue] = useState(activeCollection?.name ?? '');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setRenameValue(activeCollection?.name ?? ''), [activeCollection?.id, activeCollection?.name]);

  const inactive = useMemo(() => collections.filter((collection) => !collection.isActive), [collections]);
  const enabledCount = OPTIONAL.filter((category) => preferences[category]).length;
  const presetLabel = COLLECTION_PRESETS.find((preset) => preset.id === presetId)?.label ?? 'Custom setup';
  const name = activeCollection?.name ?? presetLabel;

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
    <section className={`setup${open ? ' is-open' : ''}`} aria-label="Collection setup">
      <div className="setup__bar">
        <p>
          <span className="setup__label">Collecting</span>
          <strong>{name}</strong>
          <span className="setup__details">
            {collectionGoalLabel(goal)}
            {enabledCount > 0 ? ` · ${enabledCount} form ${enabledCount === 1 ? 'group' : 'groups'}` : ' · base species only'}
          </span>
        </p>
        <button className="button button--secondary button--small" type="button" aria-expanded={open} aria-controls="setup-panel" onClick={() => setOpen((value) => !value)}>
          {open ? 'Done' : 'Change setup'}
        </button>
      </div>

      {open && (
        <div className="setup__panel" id="setup-panel">
          <fieldset className="setup__group">
            <legend>What are you completing?</legend>
            <div className="setup__presets">
              {COLLECTION_PRESETS.map((preset) => (
                <label key={preset.id} className={presetId === preset.id ? 'is-selected' : undefined}>
                  <input
                    type="radio"
                    name="collection-preset"
                    checked={presetId === preset.id}
                    disabled={saving}
                    onChange={() => void applyPreset(preset.id)}
                  />
                  <span>
                    <strong>{preset.label}</strong>
                    <small>{preset.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="setup__group">
            <legend>Goal</legend>
            <div className="segmented" role="group">
              {goals.map((item) => (
                <button key={item.id} type="button" className={goal === item.id ? 'is-active' : undefined} aria-pressed={goal === item.id} disabled={saving} onClick={() => void setGoal(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="setup__group">
            <legend>Forms that count</legend>
            {formsNote && <p className="setup__note">{formsNote}</p>}
            <div className="setup__forms">
              {OPTIONAL.map((category) => {
                const count = categoryCounts[category] ?? 0;
                return (
                  <label key={category} className={preferences[category] ? 'is-selected' : undefined}>
                    <input
                      type="checkbox"
                      checked={preferences[category]}
                      disabled={loading || saving || count === 0}
                      onChange={() => void setPreference(category as keyof FormPreferences, !preferences[category])}
                    />
                    <span>
                      <strong>{CATEGORY_COPY[category].label}</strong>
                      <small>{CATEGORY_COPY[category].description}</small>
                    </span>
                    <em>{count.toLocaleString()}</em>
                  </label>
                );
              })}
            </div>
            <button className="text-button" type="button" disabled={saving} onClick={() => void resetPreferences()}>
              Switch off all forms
            </button>
          </fieldset>

          {user ? (
            <fieldset className="setup__group">
              <legend>Saved setups</legend>
              <p className="setup__note">Keep several setups (say, a Living Dex and a Shiny Form Dex) and switch between them. They share the same ticked Pokémon.</p>
              <div className="setup__saved">
                <label>
                  <span>Active setup</span>
                  <select value={activeCollection?.id ?? ''} disabled={saving || collections.length === 0} onChange={(event) => void activateCollection(event.target.value)}>
                    {collections.map((collection) => (
                      <option value={collection.id} key={collection.id}>
                        {collection.name} ({completionByCollection[collection.id]?.percent ?? 0}%)
                      </option>
                    ))}
                  </select>
                </label>
                {activeCollection && (
                  <form onSubmit={(event) => { event.preventDefault(); void run(() => renameActiveCollection(renameValue), 'Renamed.'); }}>
                    <label>
                      <span>Rename it</span>
                      <input value={renameValue} maxLength={40} disabled={saving} onChange={(event) => setRenameValue(event.target.value)} />
                    </label>
                    <button className="button button--secondary button--small" type="submit" disabled={saving || !renameValue.trim() || renameValue.trim() === activeCollection.name}>Rename</button>
                  </form>
                )}
                <form onSubmit={(event) => { event.preventDefault(); void run(async () => { await createCollection(newName); setNewName(''); }, 'Saved as a new setup and switched to it.'); }}>
                  <label>
                    <span>Save current rules as a new setup</span>
                    <input value={newName} maxLength={40} placeholder="e.g. Shiny forms" disabled={saving} onChange={(event) => setNewName(event.target.value)} />
                  </label>
                  <button className="button button--primary button--small" type="submit" disabled={saving || !newName.trim()}>Save</button>
                </form>
              </div>

              {inactive.length > 0 && (
                <ul className="setup__inactive">
                  {inactive.map((collection) => (
                    <li key={collection.id}>
                      <span><strong>{collection.name}</strong> <small>{collectionGoalLabel(collection.goal)} · {completionByCollection[collection.id]?.percent ?? 0}%</small></span>
                      <button className="text-button" type="button" disabled={saving} onClick={() => void activateCollection(collection.id)}>Switch</button>
                      <button
                        className="text-button text-button--danger"
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          if (window.confirm(`Delete the setup “${collection.name}”? Ticked Pokémon are not affected.`)) {
                            void run(() => deleteCollection(collection.id), 'Setup deleted. Your Pokémon were left alone.');
                          }
                        }}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
          ) : (
            <p className="setup__note">Your setup lasts until you close this tab. <Link to="/login">Sign in</Link> to save it.</p>
          )}

          {(saveError || message) && (
            <p className={`form-message${saveError ? ' form-message--error' : ''}`} role="status">{saveError ?? message}</p>
          )}
        </div>
      )}
    </section>
  );
}
