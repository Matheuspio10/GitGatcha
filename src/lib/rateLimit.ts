import { NextResponse } from 'next/server';
import { prisma } from './prisma';
import { rateLimitKey, secondsUntilWindowEnd, windowStartFor } from './clientKey';

export { getClientIp, rateLimitKey } from './clientKey';

/** Old windows are purged on roughly 1 in CLEANUP_ODDS calls. */
const CLEANUP_ODDS = 50;
/** Longer than the longest window in use, so a live window is never purged. */
const CLEANUP_AGE_MS = 24 * 60 * 60 * 1000;

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the current window ends (0 when the call is allowed). */
  retryAfter: number;
}

/**
 * Fixed-window rate limit shared by every server instance (backed by the
 * `RateLimitHit` table). Counting is a single atomic upsert, so parallel
 * requests can't slip past the limit.
 *
 * Fails open: if the database call errors the request is allowed (and logged),
 * so an outage of this table never locks players out of the game.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = windowStartFor(now, windowSeconds);

  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimitHit" ("key", "windowStart", "count")
      VALUES (${key}, CAST(${windowStart.toISOString()} AS TIMESTAMP(3)), 1)
      ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimitHit"."count" + 1
      RETURNING "count"
    `;
    const count = Number(rows[0]?.count ?? 1);

    if (Math.random() * CLEANUP_ODDS < 1) {
      await prisma.rateLimitHit
        .deleteMany({ where: { windowStart: { lt: new Date(now - CLEANUP_AGE_MS) } } })
        .catch((err: unknown) => console.error('Rate limit cleanup failed:', err));
    }

    if (count > limit) {
      return { ok: false, retryAfter: secondsUntilWindowEnd(now, windowSeconds) };
    }
    return { ok: true, retryAfter: 0 };
  } catch (err) {
    console.error(`Rate limit check failed for "${key}" (allowing request):`, err);
    return { ok: true, retryAfter: 0 };
  }
}

/** Standard 429 response for a rejected request. */
export function tooManyRequests(retryAfter: number) {
  return NextResponse.json(
    { error: `Too many requests. Please try again in ${retryAfter}s.`, retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}

/**
 * Convenience wrapper for routes: checks the limit for `scope` (keyed by user id
 * when given, else client IP) and returns a 429 response when exceeded, or null.
 */
export async function enforceRateLimit(
  req: Request,
  scope: string,
  limit: number,
  windowSeconds: number,
  userId?: string | null,
) {
  const { ok, retryAfter } = await rateLimit(rateLimitKey(scope, req.headers, userId), limit, windowSeconds);
  return ok ? null : tooManyRequests(retryAfter);
}
