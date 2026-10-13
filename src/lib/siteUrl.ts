/** Base URL for absolute links (share links, README markdown, og:image). Server only. */
export function siteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
    || process.env.NEXTAUTH_URL
    || 'http://localhost:3000';
  return url.replace(/\/$/, '');
}
