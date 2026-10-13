import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  downloadCsvBackup,
  downloadJsonBackup,
  inspectBackupFile,
  restoreBackup,
  type BackupPreview,
} from '../lib/accountData';
import { isUsernameAvailable, profileAvatarUrl, usernameProblem } from '../lib/profile';
import { supabase } from '../lib/supabase';

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'current' | 'invalid';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function AccountPage() {
  const {
    user,
    profile,
    refreshProfile,
    signOut,
    updatePassword,
    updateEmail,
    deleteAccount,
  } = useAuth();
  const navigate = useNavigate();

  // -----------------------------
  // Public profile fields
  // -----------------------------
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [homeFriendCode, setHomeFriendCode] = useState('');
  const [homeFriendCodePublic, setHomeFriendCodePublic] = useState(false);
  const [profilePublic, setProfilePublic] = useState(true);
  const [collectionPublic, setCollectionPublic] = useState(false);
  const [collectionFriendsVisible, setCollectionFriendsVisible] = useState(true);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [availability, setAvailability] = useState<Availability>('idle');
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // -----------------------------
  // Security fields
  // -----------------------------
  const [email, setEmail] = useState(user?.email ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securityMessage, setSecurityMessage] = useState<string | null>(null);
  const [savingSecurity, setSavingSecurity] = useState(false);

  // -----------------------------
  // Backup / restore fields
  // -----------------------------
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null);
  const [backupFileError, setBackupFileError] = useState<string | null>(null);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [dataBusy, setDataBusy] = useState(false);

  // -----------------------------
  // Permanent deletion safeguard
  // -----------------------------
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const currentAvatar = useMemo(() => profileAvatarUrl(profile), [profile]);
  const needsSetup = Boolean(profile && !profile.username);

  useEffect(() => {
    if (!profile) return;
    setUsername(profile.username ?? '');
    setDisplayName(profile.display_name ?? '');
    setHomeFriendCode(profile.home_friend_code ?? '');
    setHomeFriendCodePublic(profile.home_friend_code_public ?? false);
    setProfilePublic(profile.profile_public ?? true);
    setCollectionPublic(profile.collection_public ?? false);
    setCollectionFriendsVisible(profile.collection_friends_visible ?? true);
  }, [profile]);

  useEffect(() => {
    setEmail(user?.email ?? '');
  }, [user?.email]);

  // Give availability feedback while typing, but debounce the database request
  // so one username does not become twenty requests because somebody types fast.
  useEffect(() => {
    const trimmed = username.trim();
    const problem = usernameProblem(trimmed);

    if (!trimmed) {
      setAvailability('idle');
      return;
    }

    if (problem) {
      setAvailability('invalid');
      return;
    }

    if (profile?.username && trimmed.toLowerCase() === profile.username.toLowerCase()) {
      setAvailability('current');
      return;
    }

    setAvailability('checking');
    const timer = window.setTimeout(async () => {
      const result = await isUsernameAvailable(trimmed);
      if (result.error) {
        setAvailability('invalid');
        return;
      }
      setAvailability(result.available ? 'available' : 'taken');
    }, 350);

    return () => window.clearTimeout(timer);
  }, [profile?.username, username]);

  function validateAvatar(file: File) {
    if (!ALLOWED_AVATAR_TYPES.has(file.type)) return 'Use a PNG, JPG or WebP image.';
    if (file.size > MAX_AVATAR_BYTES) return 'Profile pictures must be 5 MB or smaller.';
    return null;
  }

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user) return;

    setProfileMessage(null);
    const trimmedUsername = username.trim();
    const usernameError = usernameProblem(trimmedUsername);
    if (usernameError) {
      setProfileMessage(usernameError);
      return;
    }

    if (profile?.username?.toLowerCase() !== trimmedUsername.toLowerCase()) {
      const check = await isUsernameAvailable(trimmedUsername);
      if (check.error) {
        setProfileMessage(check.error);
        return;
      }
      if (!check.available) {
        setProfileMessage('That username is already taken or reserved.');
        return;
      }
    }

    setSavingProfile(true);
    let avatarPath = profile?.avatar_path ?? null;

    if (avatarFile) {
      const avatarError = validateAvatar(avatarFile);
      if (avatarError) {
        setSavingProfile(false);
        setProfileMessage(avatarError);
        return;
      }

      // A stable path lets changing the profile picture overwrite the previous
      // one rather than leaving a trail of abandoned uploads in Storage.
      avatarPath = `${user.id}/avatar`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(avatarPath, avatarFile, {
          upsert: true,
          contentType: avatarFile.type,
          cacheControl: '3600',
        });

      if (uploadError) {
        setSavingProfile(false);
        setProfileMessage(`Could not upload profile picture: ${uploadError.message}`);
        return;
      }
    }

    const cleanFriendCode = homeFriendCode.trim().toUpperCase() || null;
    const { error } = await supabase
      .from('profiles')
      .update({
        username: trimmedUsername,
        display_name: displayName.trim() || null,
        avatar_path: avatarPath,
        home_friend_code: cleanFriendCode,
        home_friend_code_public: profilePublic && cleanFriendCode ? homeFriendCodePublic : false,
        profile_public: profilePublic,
        collection_public: profilePublic ? collectionPublic : false,
        collection_friends_visible: collectionFriendsVisible,
      })
      .eq('id', user.id);

    setSavingProfile(false);

    if (error) {
      if (error.code === '23505') setProfileMessage('That username was just taken. Try another one.');
      else setProfileMessage(error.message);
      return;
    }

    setAvatarFile(null);
    await refreshProfile();
    setProfileMessage(needsSetup ? 'Profile ready. Welcome to DeviDex.' : 'Profile and privacy settings saved.');
  }

  async function handleEmailChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    setSecurityMessage(null);
    const nextEmail = email.trim().toLowerCase();
    if (!nextEmail || nextEmail === (user.email ?? '').toLowerCase()) {
      setSecurityMessage('Enter a different email address first.');
      return;
    }

    setSavingSecurity(true);
    const result = await updateEmail(nextEmail);
    setSavingSecurity(false);
    setSecurityMessage(result.error ?? 'Email change requested. Check your inbox for Supabase confirmation links.');
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSecurityMessage(null);

    if (newPassword.length < 8) {
      setSecurityMessage('Use at least 8 characters for the new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setSecurityMessage('Those passwords do not match.');
      return;
    }

    setSavingSecurity(true);
    const result = await updatePassword(newPassword);
    setSavingSecurity(false);
    if (result.error) {
      setSecurityMessage(result.error);
      return;
    }

    setNewPassword('');
    setConfirmPassword('');
    setSecurityMessage('Password updated.');
  }

  async function handleDownloadJson() {
    if (!user) return;
    setDataBusy(true);
    setDataMessage(null);
    try {
      await downloadJsonBackup(user, profile);
      setDataMessage('JSON backup downloaded. Keep it somewhere sensible; future-you may be grateful.');
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : 'Could not create the backup.');
    } finally {
      setDataBusy(false);
    }
  }

  async function handleDownloadCsv() {
    if (!user) return;
    setDataBusy(true);
    setDataMessage(null);
    try {
      await downloadCsvBackup(user, profile);
      setDataMessage('CSV export downloaded. JSON is still the file to use for restoring DeviDex progress.');
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : 'Could not create the CSV export.');
    } finally {
      setDataBusy(false);
    }
  }

  async function handleBackupFileChange(file: File | null) {
    setBackupFile(file);
    setBackupPreview(null);
    setBackupFileError(null);
    setDataMessage(null);

    if (!file) return;

    try {
      const preview = await inspectBackupFile(file);
      setBackupPreview(preview);
    } catch (error) {
      setBackupFileError(error instanceof Error ? error.message : 'That backup could not be read.');
    }
  }

  async function handleRestore(mode: 'merge' | 'replace') {
    if (!user || !backupFile || !backupPreview || backupFileError) {
      setDataMessage('Choose a valid DeviDex JSON backup first.');
      return;
    }

    if (mode === 'replace') {
      const confirmed = window.confirm(
        'Replace your current National Dex, Game Dex and saved collection setups with this backup? DeviDex will download a safety backup of your CURRENT data first.',
      );
      if (!confirmed) return;
    }

    setDataBusy(true);
    setDataMessage(null);
    try {
      // Replace is intentionally belt-and-braces: before changing anything,
      // automatically hand the user a copy of the current collection state.
      if (mode === 'replace') {
        await downloadJsonBackup(user, profile, 'devidex-pre-restore-safety-backup');
      }

      const result = await restoreBackup(backupFile, user.id, mode);
      const legacyNote = result.version === 1 ? ' Legacy v1 backup accepted.' : '';
      const setupNote = result.version >= 3 ? ` ${result.collectionRows} saved collection setup(s) processed.` : '';
      const gameFormNote = result.gameFormRows ? ` ${result.gameFormRows} Game Dex form row(s) processed.` : '';
      setDataMessage(`Restore complete: ${result.nationalRows} National rows and ${result.gameRows} base Game Dex rows processed.${gameFormNote}${setupNote}${legacyNote} Refresh a Dex page to see the restored state.`);
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : 'Could not restore that backup.');
    } finally {
      setDataBusy(false);
    }
  }

  async function handleDeleteAccount() {
    if (!user || !supabase) return;
    if (deleteConfirmation !== 'DELETE') {
      setDeleteMessage('Type DELETE exactly before deleting the account.');
      return;
    }

    const confirmed = window.confirm(
      'Permanently delete this DeviDex account and its saved collection data? Export a backup first if you may want the data later.',
    );
    if (!confirmed) return;

    setDeleting(true);
    setDeleteMessage(null);

    // Storage objects are not part of the auth.users cascade, so remove the
    // current avatar explicitly before deleting the account itself.
    if (profile?.avatar_path) {
      const { error: avatarError } = await supabase.storage.from('avatars').remove([profile.avatar_path]);
      if (avatarError) console.warn('Avatar cleanup failed during account deletion:', avatarError.message);
    }

    const result = await deleteAccount();
    if (result.error) {
      setDeleting(false);
      setDeleteMessage(result.error);
      return;
    }

    await signOut();
    navigate('/');
  }

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  const availabilityText = {
    idle: 'Required · 3–20 characters',
    checking: 'Checking availability…',
    available: '✓ Available',
    taken: '✕ Already taken',
    current: '✓ Your current username',
    invalid: 'Use 3–20 letters, numbers, _ or -',
  }[availability];

  return (
    <main className="account-page account-page--settings">
      <section className="account-card account-card--profile">
        <div className="account-heading-row">
          <div>
            <p className="eyebrow">{needsSetup ? 'QUICK PROFILE SETUP' : 'PROFILE & PRIVACY'}</p>
            <h1>{needsSetup ? 'Set up the useful bits.' : (profile?.display_name || profile?.username || 'Collector')}</h1>
            <p className="muted">
              {needsSetup
                ? 'Choose a unique username. Everything else here is optional and can be changed later.'
                : 'Control what other DeviDex users can see without handing the site information it has no business collecting.'}
            </p>
          </div>

          <div className="profile-avatar-large" aria-label="Current profile picture">
            {currentAvatar
              ? <img src={currentAvatar} alt="Your DeviDex profile" />
              : <span>{(profile?.username || user?.email || 'DV').slice(0, 2).toUpperCase()}</span>}
          </div>
        </div>

        <form className="profile-form" onSubmit={handleSaveProfile}>
          <div className="profile-form-grid">
            <label>
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder="Devious"
                required
                maxLength={20}
              />
              <small className={`username-status username-status--${availability}`}>{availabilityText}</small>
            </label>

            <label>
              Display name <span className="optional-label">Optional</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} placeholder="What people see above @username" />
            </label>

            <label>
              Pokémon HOME friend code <span className="optional-label">Optional</span>
              <input
                value={homeFriendCode}
                onChange={(event) => setHomeFriendCode(event.target.value.toUpperCase())}
                maxLength={32}
                placeholder="Your HOME friend code"
                autoCapitalize="characters"
              />
              <small>Stored privately unless you explicitly choose to show it.</small>
            </label>

            <label className="avatar-field">
              Profile picture <span className="optional-label">Optional</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
              />
              <small>PNG, JPG or WebP · max 5 MB</small>
            </label>
          </div>

          <div className="profile-privacy">
            <label className="toggle-row">
              <input type="checkbox" checked={profilePublic} onChange={(event) => setProfilePublic(event.target.checked)} />
              <span><strong>Public profile</strong><small>Lets people open your profile at /u/username.</small></span>
            </label>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={homeFriendCodePublic}
                disabled={!homeFriendCode.trim() || !profilePublic}
                onChange={(event) => setHomeFriendCodePublic(event.target.checked)}
              />
              <span><strong>Show my HOME friend code</strong><small>Useful for trading later; off by default.</small></span>
            </label>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={collectionPublic}
                disabled={!profilePublic}
                onChange={(event) => setCollectionPublic(event.target.checked)}
              />
              <span><strong>Show collection summary</strong><small>Shows completion totals, never your private notes.</small></span>
            </label>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={collectionFriendsVisible}
                onChange={(event) => setCollectionFriendsVisible(event.target.checked)}
              />
              <span><strong>Friends can see my collection</strong><small>Lets friends compare collections and find trades with you.</small></span>
            </label>
          </div>

          {profileMessage && <p className="form-message" role="status">{profileMessage}</p>}

          <div className="profile-actions">
            <button className="button button--primary" disabled={savingProfile || availability === 'checking' || availability === 'taken' || availability === 'invalid'}>
              {savingProfile ? 'Saving…' : needsSetup ? 'Finish profile' : 'Save profile'}
            </button>
            {profile?.username && profile.profile_public && (
              <Link className="button button--secondary" to={`/u/${profile.username}`}>View public profile</Link>
            )}
          </div>
        </form>
      </section>

      {!needsSetup && (
        <>
          <section className="account-card account-card--profile">
            <p className="eyebrow">SECURITY</p>
            <h2>Login details</h2>
            <p className="muted">Supabase handles passwords and email verification. DeviDex never stores your plaintext password.</p>

            <div className="account-settings-grid">
              <form className="settings-form" onSubmit={handleEmailChange}>
                <h3>Change email</h3>
                <label>
                  Email address
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
                </label>
                <button className="button button--secondary" disabled={savingSecurity}>Request email change</button>
              </form>

              <form className="settings-form" onSubmit={handlePasswordChange}>
                <h3>Change password</h3>
                <label>
                  New password
                  <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required autoComplete="new-password" />
                </label>
                <label>
                  Confirm new password
                  <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required autoComplete="new-password" />
                </label>
                <button className="button button--secondary" disabled={savingSecurity}>Update password</button>
              </form>
            </div>

            {securityMessage && <p className="form-message" role="status">{securityMessage}</p>}
            <button className="text-button account-signout" type="button" onClick={handleSignOut}>Sign out</button>
          </section>

          <section className="account-card account-card--profile">
            <p className="eyebrow">YOUR DATA</p>
            <h2>Your collection should never be trapped here.</h2>
            <p className="muted">Download a proper restorable JSON backup whenever you want. CSV is included for spreadsheets and human inspection.</p>

            <div className="data-action-row">
              <button className="button button--primary" type="button" disabled={dataBusy} onClick={() => void handleDownloadJson()}>Download JSON backup</button>
              <button className="button button--secondary" type="button" disabled={dataBusy} onClick={() => void handleDownloadCsv()}>Export CSV</button>
            </div>

            <div className="restore-panel">
              <label>
                Restore a DeviDex JSON backup
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => void handleBackupFileChange(event.target.files?.[0] ?? null)}
                />
              </label>

              {backupPreview && !backupFileError && (
                <div className="backup-preview" role="status">
                  <strong>{backupPreview.legacy ? 'Legacy DeviDex backup' : 'DeviDex backup ready'}</strong>
                  <span>Version {backupPreview.version} · {backupPreview.nationalRows.toLocaleString()} National rows · {backupPreview.gameRows.toLocaleString()} base Game Dex rows{backupPreview.gameFormRows ? ` · ${backupPreview.gameFormRows.toLocaleString()} Game Dex form rows` : ''}{backupPreview.version >= 3 ? ` · ${backupPreview.collectionViews} saved setups` : ''}</span>
                  <span>Exported {new Date(backupPreview.exportedAt).toLocaleString()}{backupPreview.username ? ` · @${backupPreview.username}` : ''}</span>
                  {backupPreview.legacy && <small>This older ID-based backup is still supported, but new exports use safer stable catalogue keys.</small>}
                  {backupPreview.version === 2 && <small>This v2 backup restores Pokémon progress but predates saved collection setups.</small>}
                </div>
              )}

              {backupFileError && <p className="form-message form-message--error" role="alert">{backupFileError}</p>}

              <div className="data-action-row">
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={dataBusy || !backupFile || !backupPreview || Boolean(backupFileError)}
                  onClick={() => void handleRestore('merge')}
                >
                  Merge backup
                </button>
                <button
                  className="button button--danger-outline"
                  type="button"
                  disabled={dataBusy || !backupFile || !backupPreview || Boolean(backupFileError)}
                  onClick={() => void handleRestore('replace')}
                >
                  Replace current progress
                </button>
              </div>
              <small><strong>Merge</strong> only adds progress and will not untick Pokémon you already own. <strong>Replace</strong> reproduces the backup exactly and automatically downloads your current progress first.</small>
              <small>Profile identity, email, username and privacy settings are never overwritten by an imported collection backup.</small>
            </div>

            {dataMessage && <p className="form-message" role="status">{dataMessage}</p>}
          </section>

          <section className="account-card account-card--profile danger-zone">
            <p className="eyebrow">DANGER ZONE</p>
            <h2>Delete DeviDex account</h2>
            <p className="muted">This permanently deletes your authentication account, profile, National Dex progress and Game Dex progress. Export first if you want a copy.</p>
            <label className="delete-confirm-field">
              Type <strong>DELETE</strong> to confirm
              <input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" />
            </label>
            {deleteMessage && <p className="form-message" role="status">{deleteMessage}</p>}
            <button className="button button--danger" type="button" disabled={deleting || deleteConfirmation !== 'DELETE'} onClick={() => void handleDeleteAccount()}>
              {deleting ? 'Deleting…' : 'Permanently delete account'}
            </button>
          </section>
        </>
      )}
    </main>
  );
}
