/**
 * GitHub avatars at the size they are shown. GitHub resizes them for free
 * (`?s=` on avatars.githubusercontent.com, `?size=` on github.com/<login>.png),
 * so a 32px thumbnail no longer downloads the 460px default. Used instead of
 * next/image on purpose: Vercel's image optimization is billed per source
 * image, and the packs draw from millions of different developers.
 *
 * `px` is the displayed CSS size; the URL asks for twice that (sharp on retina
 * screens). Other URLs (uploads as data:, Google pictures) are returned unchanged.
 */
export function sizedAvatar<T extends string | null | undefined>(url: T, px: number): T {
  if (!url) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const size = String(Math.min(Math.round(px * 2), 460));
  if (parsed.hostname === 'avatars.githubusercontent.com') {
    parsed.searchParams.set('s', size);
  } else if (parsed.hostname === 'github.com' && parsed.pathname.endsWith('.png')) {
    parsed.searchParams.set('size', size);
  } else {
    return url;
  }
  return parsed.toString() as T;
}
