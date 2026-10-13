import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PokemonCard } from '../components/PokemonCard';
import { PokemonPicker } from '../components/PokemonPicker';
import { useAuth } from '../context/AuthContext';
import { createForumPost, listForumCategories, type ForumCategory } from '../lib/forums';

export function NewForumPostPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [category, setCategory] = useState(searchParams.get('category') ?? '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pokemonFormId, setPokemonFormId] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listForumCategories().then((result) => {
      const allowed = result.data.filter((entry) => isAdmin || !entry.adminOnlyPosts);
      setCategories(allowed);
      setCategory((current) => (allowed.some((entry) => entry.slug === current) ? current : allowed.find((entry) => entry.slug === 'general')?.slug ?? allowed[0]?.slug ?? ''));
    });
  }, [isAdmin]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await createForumPost(category, title, body, pokemonFormId);
    setBusy(false);
    if (result.error || !result.data) {
      setError(result.error ?? 'Could not post.');
      return;
    }
    navigate(`/forums/post/${result.data}`, { replace: true });
  }

  if (!profile?.username) {
    return (
      <main className="forum-thread-page">
        <section className="dex-empty-state">
          <strong>Pick a username first.</strong>
          <p>Posts show your username.</p>
          <Link className="button button--primary" to="/account">Set up your profile</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="forum-thread-page">
      <Link className="text-button" to={category ? `/forums/${category}` : '/forums'}>← Back</Link>
      <form className="forum-new-post" onSubmit={handleSubmit}>
        <p className="eyebrow">NEW POST</p>
        <h1>Start a thread.</h1>

        <label className="social-field">
          Forum
          <select value={category} onChange={(event) => setCategory(event.target.value)} required>
            {categories.map((entry) => <option key={entry.slug} value={entry.slug}>{entry.name}</option>)}
          </select>
        </label>

        <label className="social-field">
          Title
          <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} required minLength={3} placeholder="e.g. LF: shiny Eevee, can offer Bulbasaur" />
        </label>

        <label className="social-field">
          Post <span className="muted">(optional)</span>
          <textarea value={body} maxLength={10000} rows={9} onChange={(event) => setBody(event.target.value)} />
          <small className="muted">{body.length.toLocaleString()} / 10,000 · plain text</small>
        </label>

        <div className="forum-new-post__pokemon">
          {pokemonFormId != null ? (
            <>
              <PokemonCard formId={pokemonFormId} shiny={false} />
              <button className="text-button" type="button" onClick={() => setPokemonFormId(null)}>Remove Pokémon</button>
            </>
          ) : (
            <button className="button button--secondary button--small" type="button" onClick={() => setPicking(true)}>Attach a Pokémon</button>
          )}
        </div>

        {error && <p className="form-message form-message--error">{error}</p>}

        <div className="forum-editor__actions">
          <button className="button button--primary" type="submit" disabled={busy || title.trim().length < 3 || !category}>
            {busy ? 'Posting…' : 'Post'}
          </button>
        </div>
      </form>

      <PokemonPicker
        open={picking}
        title="Attach a Pokémon"
        confirmLabel="Attach"
        onClose={() => setPicking(false)}
        onPick={(pick) => {
          setPokemonFormId(pick.formId);
          setPicking(false);
        }}
      />
    </main>
  );
}
