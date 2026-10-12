/**
 * Vercel build entry (npm run vercel-build).
 *
 * - Migrations run only for production deploys: preview builds of unmerged branches
 *   must never change the production database.
 * - `prisma migrate status` first (no lock); `migrate deploy` only when something is pending.
 * - Migrations go through Neon's direct endpoint, not the pgbouncer pooler: Prisma's
 *   session-level advisory lock can get stuck on a pooled connection (error P1002).
 */
import { execSync } from 'node:child_process';

const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });

/** Neon pooled host "<endpoint>-pooler.<region>…" → direct host "<endpoint>.<region>…". */
function directUrlFor(url) {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.replace('-pooler.', '.');
    return u.toString();
  } catch {
    return url;
  }
}

run('prisma generate');

if (process.env.VERCEL_ENV === 'production') {
  const DATABASE_URL = process.env.DIRECT_URL || directUrlFor(process.env.DATABASE_URL ?? '');
  let pending = false;
  try {
    run('prisma migrate status', { DATABASE_URL });
  } catch {
    pending = true; // non-zero exit: migrations to apply (or status unavailable — deploy decides)
  }
  if (pending) run('prisma migrate deploy', { DATABASE_URL });
} else {
  console.log(`Skipping database migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'})`);
}

run('next build');
