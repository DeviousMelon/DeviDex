import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { pokemonLabel, usePokemonCatalog } from '../hooks/usePokemonCatalog';
import {
  deleteLastChanceEntry,
  getLastChanceList,
  LAST_CHANCE_CATEGORIES,
  saveLastChanceEntry,
  slugify,
  type LastChanceCategory,
  type LastChanceDraft,
  type LastChanceEntry,
} from '../lib/bank';
import { PokemonPicker } from './PokemonPicker';

const EMPTY: LastChanceDraft = {
  slug: '',
  title: '',
  category: 'form',
  description: '',
  formId: null,
  speciesId: null,
  sourceUrl: '',
  sortOrder: 100,
  isPublished: true,
};

function toDraft(entry: LastChanceEntry): LastChanceDraft {
  return {
    slug: entry.slug,
    title: entry.title,
    category: entry.category,
    description: entry.description,
    formId: entry.formId,
    speciesId: entry.speciesId,
    sourceUrl: entry.sourceUrl ?? '',
    sortOrder: entry.sortOrder,
    isPublished: entry.isPublished,
  };
}

/** Admin: edit the public "last chance before Bank closes" list. */
export function AdminBankList() {
  const { catalog } = usePokemonCatalog();
  const [entries, setEntries] = useState<LastChanceEntry[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<LastChanceDraft>(EMPTY);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const result = await getLastChanceList();
    setEntries(result.data);
    if (result.error) setMessage({ tone: 'error', text: result.error });
  }, []);

  useEffect(() => { void load(); }, [load]);

  function edit(entry: LastChanceEntry | null) {
    setEditingId(entry?.id ?? null);
    setDraft(entry ? toDraft(entry) : EMPTY);
    setMessage(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const slug = draft.slug.trim() || slugify(draft.title);
    if (!slug) {
      setMessage({ tone: 'error', text: 'Give it a title first.' });
      return;
    }
    setSaving(true);
    const result = await saveLastChanceEntry(editingId, { ...draft, slug });
    setSaving(false);
    if (result.error) {
      setMessage({ tone: 'error', text: result.error });
      return;
    }
    setMessage({ tone: 'ok', text: editingId == null ? 'Added.' : 'Saved.' });
    edit(null);
    await load();
  }

  async function remove(entry: LastChanceEntry) {
    if (!window.confirm(`Delete "${entry.title}"? Everyone's ticks on it go too.`)) return;
    const result = await deleteLastChanceEntry(entry.id);
    if (result.error) setMessage({ tone: 'error', text: result.error });
    if (editingId === entry.id) edit(null);
    await load();
  }

  const linked = draft.formId != null
    ? catalog?.byFormId.get(draft.formId)
    : draft.speciesId != null
      ? catalog?.entries.find((entry) => entry.speciesId === draft.speciesId && entry.isDefault)
      : undefined;

  return (
    <section className="section admin-section admin-bank" aria-labelledby="admin-bank-title">
      <div className="section-heading">
        <div>
          <h2 id="admin-bank-title">Bank shutdown: last-chance list</h2>
          <p className="muted">Shown on /bank. Link a Pokémon and its page gets an "only before Bank closes" notice.</p>
        </div>
      </div>

      {message && <p className={`form-message${message.tone === 'error' ? ' form-message--error' : ''}`}>{message.text}</p>}

      <form className="admin-bank__form" onSubmit={(event) => void save(event)}>
        <h3>{editingId == null ? 'Add an entry' : 'Edit entry'}</h3>
        <label>
          <span>Title</span>
          <input required maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        </label>
        <label>
          <span>Category</span>
          <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as LastChanceCategory })}>
            {LAST_CHANCE_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
          </select>
        </label>
        <label className="admin-bank__wide">
          <span>Description</span>
          <textarea rows={3} maxLength={1000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        </label>
        <label>
          <span>Source link (https)</span>
          <input type="url" pattern="https://.*" value={draft.sourceUrl} onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })} />
        </label>
        <label>
          <span>Sort order</span>
          <input type="number" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) || 0 })} />
        </label>
        <div className="admin-bank__pokemon">
          <span>Linked Pokémon</span>
          <div>
            <strong>{linked ? `${pokemonLabel(linked)}${draft.speciesId != null ? ' (all forms)' : ''}` : 'None'}</strong>
            <button className="text-button" type="button" onClick={() => setPicking(true)}>Choose</button>
            {(draft.formId != null || draft.speciesId != null) && (
              <button className="text-button text-button--quiet" type="button" onClick={() => setDraft({ ...draft, formId: null, speciesId: null })}>Clear</button>
            )}
          </div>
        </div>
        <label className="bank-check">
          <input type="checkbox" checked={draft.isPublished} onChange={(event) => setDraft({ ...draft, isPublished: event.target.checked })} />
          <span>Published</span>
        </label>
        <div className="admin-bank__actions">
          <button className="button button--primary button--small" type="submit" disabled={saving}>{saving ? 'Saving…' : editingId == null ? 'Add' : 'Save'}</button>
          {editingId != null && <button className="text-button text-button--quiet" type="button" onClick={() => edit(null)}>Cancel</button>}
        </div>
      </form>

      <ul className="admin-bank__list">
        {entries.map((entry) => (
          <li key={entry.id} className={entry.isPublished ? undefined : 'is-draft'}>
            <span>
              <strong>{entry.title}</strong>
              <small>{LAST_CHANCE_CATEGORIES.find((c) => c.id === entry.category)?.label} · #{entry.sortOrder}{entry.isPublished ? '' : ' · hidden'}</small>
            </span>
            <button className="text-button" type="button" onClick={() => edit(entry)}>Edit</button>
            <button className="text-button text-button--danger" type="button" onClick={() => void remove(entry)}>Delete</button>
          </li>
        ))}
      </ul>

      <PokemonPicker
        open={picking}
        title="Link a Pokémon"
        confirmLabel="Link"
        onClose={() => setPicking(false)}
        onPick={(pick) => {
          setPicking(false);
          const entry = catalog?.byFormId.get(pick.formId);
          // A default form means "the whole species"; anything else is that form only.
          setDraft((current) => entry?.isDefault
            ? { ...current, speciesId: entry.speciesId, formId: null }
            : { ...current, formId: pick.formId, speciesId: null });
        }}
      />
    </section>
  );
}
