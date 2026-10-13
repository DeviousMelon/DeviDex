import { socialAvatarUrl, type SocialUser } from '../lib/social';

type UserAvatarProps = {
  user: Pick<SocialUser, 'username' | 'avatarPath' | 'profileUpdatedAt'> | null;
  size?: 'sm' | 'md' | 'lg';
};

/** Round avatar with an initials fallback, used across friends, chat and forums. */
export function UserAvatar({ user, size = 'md' }: UserAvatarProps) {
  const url = socialAvatarUrl(user);
  const initials = (user?.username ?? '?').slice(0, 2).toUpperCase();

  return (
    <span className={`user-avatar user-avatar--${size}`} aria-hidden="true">
      {url ? <img src={url} alt="" loading="lazy" /> : initials}
    </span>
  );
}
