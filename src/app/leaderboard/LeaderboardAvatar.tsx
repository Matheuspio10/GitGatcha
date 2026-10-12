'use client';

/** Only sources a browser can actually render as an avatar. */
function isUsableImage(src: string | null | undefined): src is string {
  if (!src) return false;
  const s = src.trim();
  return s.startsWith('data:image/') || s.startsWith('https://') || s.startsWith('http://') || s.startsWith('/');
}

/**
 * Avatar for leaderboard rows. The player's initial is always rendered
 * underneath; the image sits on top and is hidden when it is missing, isn't a
 * usable URL / data URI, or fails to load (expired provider URLs, deleted
 * uploads). With an empty alt, a broken image that fails before hydration
 * renders as nothing, so the initial still shows instead of a broken icon.
 */
export function LeaderboardAvatar({ username, image }: { username: string; image?: string | null }) {
  const initial = (username || '?').charAt(0).toUpperCase();

  return (
    <span className="relative w-8 h-8 shrink-0">
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-black"
      >
        {initial}
      </span>
      {isUsableImage(image) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          width={32}
          height={32}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
          className="absolute inset-0 w-8 h-8 rounded-full object-cover ring-2 ring-slate-800 border border-indigo-500/30"
        />
      )}
    </span>
  );
}
