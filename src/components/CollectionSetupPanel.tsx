import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { COLLECTION_PRESETS, useFormPreferences } from '../context/FormPreferencesContext';
import { collectionGoalLabel } from '../lib/collectionPresets';
import type { CollectionGoal } from '../types';

const goals: Array<{ id: CollectionGoal; label: string }> = [
  { id: 'living', label: 'Living' },
  { id: 'shiny', label: 'Shiny' },
  { id: 'both', label: 'Living + Shiny' },
];

type CollectionSetupPanelProps = {
  completionByCollection: Record<string, { percent: number; current: number; total: number }>;
};

export function CollectionSetupPanel({ completionByCollection }: CollectionSetupPanelProps) {
  const { user } = useAuth();
  const {
    collections,
    activeCollection,
    presetId,
    goal,
    saving,
    saveError,
    applyPreset,
    setGoal,
    createCollection,
    activateCollection,
    renameActiveCollection,
    deleteCollection,
  } = useFormPreferences();
  const [newName, setNewName] = useState('');
  const [renameValue, setRenameValue] = useState(activeCollection?.name ?? '');
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  useEffect(() => {
    setRenameValue(activeCollection?.name ?? '');
  }, [activeCollection?.id, activeCollection?.name]);

  const inactiveCollections = useMemo(
    () => collections.filter((collection) => !collection.isActive),
    [collections],
  );

  async function createSavedCollection() {
    setLocalMessage(null);
    try {
      await createCollection(newName);
      setNewName('');
      setLocalMessage('Saved and switched to the new collection setup.');
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : 'Could not create the collection.');
    }
  }

  async function renameCollection() {
    setLocalMessage(null);
    try {
      await renameActiveCollection(renameValue);
      setLocalMessage('Collection renamed.');
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : 'Could not rename the collection.');
    }
  }

  async function removeCollection(collectionId: string, name: string) {
    if (!window.confirm(`Delete the saved setup “${name}”? Your Pokémon progress will NOT be deleted.`)) return;
    setLocalMessage(null);
    try {
      await deleteCollection(collectionId);
      setLocalMessage('Saved setup deleted. Pokémon progress was left alone.');
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : 'Could not delete the collection.');
    }
  }

  return (
    <section className="collection-setup-panel" aria-labelledby="collection-setup-title">
      <div className="collection-setup-panel__heading">
        <div>
          <p className="eyebrow">COLLECTION SETUP</p>
          <h2 id="collection-setup-title">Choose what you are trying to complete.</h2>
          <p>
            Presets change the rules and completion target, never your saved Pokémon. Switch freely
            without re-ticking the same creatures like some sort of administrative ritual.
          </p>
        </div>
        <div className="active-collection-badge">
          <span>{user ? 'Active collection' : 'Guest setup'}</span>
          <strong>{activeCollection?.name ?? COLLECTION_PRESETS.find((preset) => preset.id === presetId)?.label ?? 'Custom setup'}</strong>
          <small>{collectionGoalLabel(goal)}</small>
        </div>
      </div>

      <div className="collection-preset-grid" aria-label="Collection presets">
        {COLLECTION_PRESETS.map((preset) => (
          <button
            className={`collection-preset-card${presetId === preset.id ? ' is-active' : ''}`}
            type="button"
            key={preset.id}
            disabled={saving}
            onClick={() => void applyPreset(preset.id)}
          >
            <span className="collection-preset-card__check" aria-hidden="true">{presetId === preset.id ? '✓' : '○'}</span>
            <strong>{preset.label}</strong>
            <span>{preset.description}</span>
          </button>
        ))}
      </div>

      <div className="collection-goal-row">
        <span>Primary completion goal</span>
        <div className="filter-pills" aria-label="Collection completion goal">
          {goals.map((item) => (
            <button
              type="button"
              key={item.id}
              className={goal === item.id ? 'is-active' : ''}
              disabled={saving}
              onClick={() => void setGoal(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {presetId === 'custom' && (
        <p className="collection-custom-note">
          <strong>Custom setup.</strong> Your form switches or completion goal no longer exactly match a named preset. That is entirely allowed. DeviDex is a tracker, not a small bureaucracy.
        </p>
      )}

      {user ? (
        <div className="saved-collections-area">
          <div className="saved-collections-area__header">
            <div>
              <strong>Saved collection setups</strong>
              <span>Each setup has its own rules and completion percentage, using the same ownership inventory.</span>
            </div>
            <span>{collections.length} saved</span>
          </div>

          <div className="saved-collection-switcher">
            <label>
              <span>Switch collection</span>
              <select
                value={activeCollection?.id ?? ''}
                disabled={saving || collections.length === 0}
                onChange={(event) => void activateCollection(event.target.value)}
              >
                {collections.map((collection) => (
                  <option value={collection.id} key={collection.id}>{collection.name} · {completionByCollection[collection.id]?.percent ?? 0}%</option>
                ))}
              </select>
            </label>

            {activeCollection && (
              <div className="saved-collection-rename">
                <label>
                  <span>Active name</span>
                  <input
                    value={renameValue}
                    maxLength={40}
                    disabled={saving}
                    onChange={(event) => setRenameValue(event.target.value)}
                  />
                </label>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={saving || renameValue.trim() === activeCollection.name}
                  onClick={() => void renameCollection()}
                >
                  Rename
                </button>
              </div>
            )}
          </div>

          <div className="saved-collection-create">
            <label>
              <span>Save current setup as a new collection</span>
              <input
                value={newName}
                maxLength={40}
                placeholder="e.g. Shiny Forms"
                disabled={saving}
                onChange={(event) => setNewName(event.target.value)}
              />
            </label>
            <button
              className="button button--primary"
              type="button"
              disabled={saving || !newName.trim()}
              onClick={() => void createSavedCollection()}
            >
              Save as new
            </button>
          </div>

          {inactiveCollections.length > 0 && (
            <details className="saved-collection-manage">
              <summary>Manage inactive setups</summary>
              <div>
                {inactiveCollections.map((collection) => (
                  <article key={collection.id}>
                    <span>
                      <strong>{collection.name}</strong>
                      <small>{collectionGoalLabel(collection.goal)} · {completionByCollection[collection.id]?.percent ?? 0}% complete</small>
                    </span>
                    <div>
                      <button type="button" disabled={saving} onClick={() => void activateCollection(collection.id)}>Switch</button>
                      <button type="button" disabled={saving} onClick={() => void removeCollection(collection.id, collection.name)}>Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            </details>
          )}
        </div>
      ) : (
        <p className="collection-guest-preset-note">
          Guest presets work for this browser session. Sign in to keep named setups and switch between them later.
        </p>
      )}

      {(saveError || localMessage) && (
        <p className={saveError ? 'collection-error' : 'collection-inline-success'}>
          {saveError ?? localMessage}
        </p>
      )}
    </section>
  );
}
