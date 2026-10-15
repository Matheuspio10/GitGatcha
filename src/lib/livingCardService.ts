import { prisma } from './prisma';
import { rateLimit } from './rateLimit';
import { fetchGitHubUserStats, GitHubAuthError, GitHubUnavailableError } from './githubService';
import {
  LIVING_CARD_BATCH, LIVING_CARD_REFRESH_DAYS, LIVING_CARD_SLOT_SECONDS,
  livingCardUpdate, statsChanged,
} from './livingCards';

/** Per server instance: don't even ask for the global slot more than once a minute. */
const LOCAL_THROTTLE_MS = 60_000;
let lastLocalAttempt = 0;

interface ClaimedCard { id: string; githubUsername: string; rarity: string; atk: number; def: number; hp: number; previous: Date | null }

/**
 * Takes the card refreshed longest ago (or never) that is due, and marks it as
 * refreshed right away: parallel runs never pick the same card, and a developer
 * GitHub can't return goes to the back of the queue instead of blocking it.
 */
async function claimOldestCard(): Promise<ClaimedCard | null> {
  const rows = await prisma.$queryRaw<ClaimedCard[]>`
    WITH due AS (
      SELECT "id", "profileUpdatedAt" AS "previous" FROM "Card"
      WHERE "profileUpdatedAt" IS NULL OR "profileUpdatedAt" < NOW() - make_interval(days => ${LIVING_CARD_REFRESH_DAYS}::int)
      ORDER BY "profileUpdatedAt" ASC NULLS FIRST, "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "Card" c SET "profileUpdatedAt" = NOW()
    FROM due WHERE c."id" = due."id"
    RETURNING c."id", c."githubUsername", c."rarity", c."atk", c."def", c."hp", due."previous"
  `;
  return rows[0] ?? null;
}

export interface LivingRefreshReport {
  refreshed: number;
  changed: { login: string; from: string; to: string }[];
  /** Developers whose GitHub profile now belongs to another rarity: stats kept (see livingCards.ts). */
  drifted: string[];
  missing: string[];
}

/**
 * Refreshes up to `batch` due cards from GitHub (see livingCards.ts). Never throws.
 * `useSlot` (traffic-driven calls) makes it run at most once per LIVING_CARD_SLOT_SECONDS
 * across all instances; the daily cron skips the slot.
 */
export async function refreshLivingCards({ batch = LIVING_CARD_BATCH, useSlot = true } = {}): Promise<LivingRefreshReport | null> {
  const report: LivingRefreshReport = { refreshed: 0, changed: [], drifted: [], missing: [] };
  try {
    if (useSlot) {
      if (Date.now() - lastLocalAttempt < LOCAL_THROTTLE_MS) return null;
      lastLocalAttempt = Date.now();
      const slot = await rateLimit('living-cards:slot', 1, LIVING_CARD_SLOT_SECONDS);
      if (!slot.ok) return null;
    }
    for (let i = 0; i < batch; i++) {
      const card = await claimOldestCard();
      if (!card) break;
      let dev;
      try {
        dev = await fetchGitHubUserStats(card.githubUsername);
      } catch (err) {
        // GitHub unavailable: the card was not refreshed, keep its place in the queue
        await prisma.card.update({ where: { id: card.id }, data: { profileUpdatedAt: card.previous } });
        throw err;
      }
      // Deleted, renamed or now an organization: the card keeps what it has
      if (!dev) { report.missing.push(card.githubUsername); continue; }
      const update = livingCardUpdate(card, dev);
      if (!update) continue;
      const { drifted, ...data } = update;
      await prisma.card.update({ where: { id: card.id }, data });
      report.refreshed++;
      if (drifted) report.drifted.push(card.githubUsername);
      else if (statsChanged(card, data)) {
        report.changed.push({ login: card.githubUsername, from: `${card.atk}/${card.def}/${card.hp}`, to: `${data.atk}/${data.def}/${data.hp}` });
      }
    }
  } catch (err) {
    // Out of GitHub quota or a bad token: try again on a later slot
    if (!(err instanceof GitHubUnavailableError || err instanceof GitHubAuthError)) {
      console.error('[Living cards] refresh failed:', err);
    }
  }
  if (report.refreshed) {
    const changed = report.changed.map(c => `${c.login} ${c.from} → ${c.to}`).join(', ') || 'none';
    console.log(`[Living cards] ${report.refreshed} refreshed; stats changed: ${changed}; rarity drift (stats kept): ${report.drifted.join(', ') || 'none'}`);
  }
  return report;
}
