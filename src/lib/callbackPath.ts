/** Where a player lands after signing in when nothing (usable) asked for another page. */
export const DEFAULT_AFTER_LOGIN = '/store';

/**
 * The page to open after signing in, from the login page's `callbackUrl` (the
 * proxy sends the page a signed-out visitor tried to open, e.g. an invite link
 * /league?join=CODE). Only the path, query and hash are kept, so it always
 * stays on this site (the proxy builds it on NEXTAUTH_URL, which in dev is
 * another port). Anything odd falls back to the store.
 */
export function safeCallbackPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_AFTER_LOGIN;
  let url: URL;
  try {
    url = new URL(raw, 'http://placeholder.local');
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return DEFAULT_AFTER_LOGIN;
  const path = url.pathname;
  // "//evil.com" would be read by the browser as another host; /login would loop
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path === '/login' || path.startsWith('/api/')) {
    return DEFAULT_AFTER_LOGIN;
  }
  return path + url.search + url.hash;
}
