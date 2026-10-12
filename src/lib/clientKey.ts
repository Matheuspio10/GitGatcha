/**
 * Pure helpers that identify who is calling an API route, used as rate limit keys.
 * Kept free of Prisma/Next imports so they can be unit tested directly.
 */

type HeaderSource = { get(name: string): string | null };

const MAX_IP_LENGTH = 64;

/** Normalizes one IP token: trims, strips IPv6 brackets and IPv4 ports. Returns null when empty/unusable. */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let ip = raw.trim();
  if (!ip || ip.toLowerCase() === 'unknown') return null;

  // "[2001:db8::1]:443" -> "2001:db8::1"
  const bracketed = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) {
    ip = bracketed[1];
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) {
    // "203.0.113.7:51234" -> "203.0.113.7"
    ip = ip.slice(0, ip.lastIndexOf(':'));
  }

  if (!/^[0-9A-Za-z.:%_-]+$/.test(ip)) return null;
  return ip.slice(0, MAX_IP_LENGTH).toLowerCase();
}

/**
 * Client IP as reported by the proxy in front of the app (Vercel sets both headers).
 * Uses the first `x-forwarded-for` entry (the original client), falling back to `x-real-ip`.
 */
export function getClientIp(headers: HeaderSource): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = normalizeIp(forwarded.split(',')[0]);
    if (first) return first;
  }
  return normalizeIp(headers.get('x-real-ip'));
}

/**
 * Rate limit key for an action: the user id when logged in, otherwise the client IP.
 * e.g. `forge-search:user:abc` or `register:ip:203.0.113.7`.
 */
export function rateLimitKey(scope: string, headers: HeaderSource, userId?: string | null): string {
  if (userId) return `${scope}:user:${userId}`;
  return `${scope}:ip:${getClientIp(headers) ?? 'unknown'}`;
}

/** Start of the fixed window that contains `nowMs`. */
export function windowStartFor(nowMs: number, windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(nowMs / windowMs) * windowMs);
}

/** Whole seconds until the window that contains `nowMs` ends (at least 1). */
export function secondsUntilWindowEnd(nowMs: number, windowSeconds: number): number {
  const end = windowStartFor(nowMs, windowSeconds).getTime() + windowSeconds * 1000;
  return Math.max(1, Math.ceil((end - nowMs) / 1000));
}
