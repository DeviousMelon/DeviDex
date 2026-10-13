import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { profileAvatarUrl } from '../lib/profile';
import { supabase } from '../lib/supabase';
import type { UserProfile } from '../types';

type PublicCollectionSummary = {
  living_owned: number;
  shiny_owned: number;
  trackable_total: number;
  started_game_dexes: number;
};

export function PublicProfilePage() {
  const { username } = useParams();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [summary, setSummary] = useState<PublicCollectionSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!supabase || !username) {
        setLoading(false);
        return;
      }

      // Public profile and public collection summary are separate RPCs on
      // purpose. The browser never receives direct SELECT access to private
      // profile fields or another user's raw collection rows.
      const [profileResult, summaryResult] = await Promise.all([
        supabase.rpc('get_public_profile', { candidate: username }),
        supabase.rpc('get_public_collection_summary', { candidate: username }),
      ]);

      if (profileResult.error) console.error('Could not load public profile:', profileResult.error.message);
      if (summaryResult.error) console.error('Could not load public collection summary:', summaryResult.error.message);

      const firstProfile = Array.isArray(profileResult.data) ? profileResult.data[0] : profileResult.data;
      const firstSummary = Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data;
      setProfile((firstProfile as UserProfile | null) ?? null);
      setSummary((firstSummary as PublicCollectionSummary | null) ?? null);
      setLoading(false);
    }

    void load();
  }, [username]);

  if (loading) {
    return <main className="account-page"><section className="dex-empty-state"><strong>Loading profile…</strong></section></main>;
  }

  if (!profile?.username) {
    return (
      <main className="account-page">
        <section className="dex-empty-state">
          <strong>That profile is private or does not exist.</strong>
          <Link className="button button--secondary" to="/">Back to DeviDex</Link>
        </section>
      </main>
    );
  }

  const avatar = profileAvatarUrl(profile);
  const livingPercent = summary?.trackable_total
    ? Math.round((summary.living_owned / summary.trackable_total) * 100)
    : 0;
  const shinyPercent = summary?.trackable_total
    ? Math.round((summary.shiny_owned / summary.trackable_total) * 100)
    : 0;

  return (
    <main className="account-page">
      <section className="public-profile-card">
        <div className="profile-avatar-large profile-avatar-large--public">
          {avatar ? <img src={avatar} alt={`${profile.username}'s profile`} /> : <span>{profile.username.slice(0, 2).toUpperCase()}</span>}
        </div>
        <p className="eyebrow">DEVIDEX COLLECTOR</p>
        <h1>{profile.display_name || profile.username}</h1>
        <p className="profile-handle">@{profile.username}</p>

        {profile.home_friend_code_public && profile.home_friend_code && (
          <div className="profile-code-card">
            <span>Pokémon HOME friend code</span>
            <strong>{profile.home_friend_code}</strong>
          </div>
        )}

        {profile.collection_public && summary && (
          <div className="public-collection-summary" aria-label="Public collection summary">
            <div>
              <span>Living Dex</span>
              <strong>{summary.living_owned.toLocaleString()} / {summary.trackable_total.toLocaleString()}</strong>
              <small>{livingPercent}% complete</small>
            </div>
            <div>
              <span>Shiny Dex</span>
              <strong>{summary.shiny_owned.toLocaleString()} / {summary.trackable_total.toLocaleString()}</strong>
              <small>{shinyPercent}% complete</small>
            </div>
            <div>
              <span>Started Game Dexes</span>
              <strong>{summary.started_game_dexes.toLocaleString()}</strong>
              <small>Only a count is shared</small>
            </div>
          </div>
        )}

        <p className="muted">
          {profile.collection_public
            ? 'This collector chose to share a summary only. Individual collection rows and notes remain private.'
            : 'This collector keeps their collection progress private.'}
        </p>
      </section>
    </main>
  );
}
