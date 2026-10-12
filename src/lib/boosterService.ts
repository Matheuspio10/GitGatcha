import { randomInt } from 'node:crypto';
import { prisma } from './prisma';
import { DevStats, GitHubUnavailableError, toCardData } from './githubService';
import { getPackById } from './packDefinitions';
import type { PoolFilter } from './devSampler';
import { getPlayerGithubToken, getRecentPulls, recordPulls, samplerForToken } from './samplerStore';
import { refillReserve, reserveDeficit, takeFromReserve } from './boosterReserve';
import { isRarity, Rarity, rarityForSlot } from './rarity';
import { asArray, asRecord, withUserLock } from './userLock';
import { applyPity, packsUntilPity, pityCounterUpdate, PITY_THRESHOLD } from './pity';

const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

const secureMathRandom = () => randomInt(0, 0xffffffff) / 0xffffffff;

// ─── Rarity Slot Generation ─────────────────────────────────────────────

function getRaritiesForSlots(count: number): string[] {
  return Array.from({ length: count }, (_, i) => rarityForSlot(i, secureMathRandom()));
}

function ensureMinimumRarity(rarities: string[], minRarity: string): string[] {
  const minIdx = RARITY_ORDER.indexOf(minRarity);
  const hasMinimum = rarities.some(r => RARITY_ORDER.indexOf(r) >= minIdx);

  if (!hasMinimum) {
    // Upgrade the lowest card to the guaranteed minimum
    let lowestIdx = 0;
    let lowestRank = RARITY_ORDER.indexOf(rarities[0]);
    for (let i = 1; i < rarities.length; i++) {
      const rank = RARITY_ORDER.indexOf(rarities[i]);
      if (rank < lowestRank) {
        lowestRank = rank;
        lowestIdx = i;
      }
    }
    rarities[lowestIdx] = minRarity;
  }

  return rarities;
}

const FRAGMENTS_PER_RARITY: Record<string, number> = {
  'Common': 5,
  'Uncommon': 10,
  'Rare': 20,
  'Epic': 40,
  'Legendary': 80
};

export async function openBoosterPack(userId: string, packId?: string) {
  const pityTicket: PityTicket = { consumed: false, settled: false };
  try {
    return await drawBoosterPack(userId, packId, pityTicket);
  } catch (err) {
    // The opening failed before any card was granted (the caller gives the pack back):
    // a pity consumed for it stays due for the next opening
    if (pityTicket.consumed && !pityTicket.settled) await updatePityCounter(userId, false, true);
    throw err;
  }
}

interface PityTicket {
  /** The due pity was claimed for this opening (counter reset to 0). */
  consumed: boolean;
  /** The counter was updated after the cards were granted. */
  settled: boolean;
}

async function drawBoosterPack(userId: string, packId: string | undefined, pityTicket: PityTicket) {
  const pack = packId ? getPackById(packId) : null;
  const effectivePackId = packId || '_generic';
  const cardsToPull = pack?.cardCount ?? 5;
  const pool: PoolFilter = pack?.pool ?? {};

  let pickedRarities: string[] = [];
  // All-Common packs (Junk Drawer) are outside the Legendary pity
  const countsForPity = !pack?.allCommon;
  let pityTriggered = false;

  if (pack?.allCommon) {
    pickedRarities = Array(cardsToPull).fill('Common');
  } else {
    pickedRarities = getRaritiesForSlots(cardsToPull);
    if (pack?.guaranteedMinRarity) {
      pickedRarities = ensureMinimumRarity(pickedRarities, pack.guaranteedMinRarity);
    }
    // Pity: after PITY_THRESHOLD - 1 packs without a Legendary, this one gets one (before drawing)
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { packsSinceLegendary: true } });
    const pity = applyPity(pickedRarities, user?.packsSinceLegendary ?? 0);
    if (pity.triggered && await consumePity(userId)) {
      pickedRarities = pity.rarities;
      pityTriggered = true;
      pityTicket.consumed = true;
    }
  }

  // Devs this player pulled from this booster type in the last 6h, plus the ones drawn in this pack
  const exclude = await getRecentPulls(userId, effectivePackId);
  // Live draws spend the player's own GitHub quota when they connected GitHub
  const sampler = samplerForToken(await getPlayerGithubToken(userId));
  let githubDown = false;

  // 1. reserve (pre-drawn, instant)  2. live uniform draw  3. last resort: an existing card
  const drawSlot = async (slotRarity: string): Promise<{ dev: DevStats | null; source: CardSource }> => {
    const rarity: Rarity = isRarity(slotRarity) ? slotRarity : 'Common';
    try {
      const reserved = await takeFromReserve(effectivePackId, rarity, exclude);
      if (reserved) return { dev: reserved, source: 'reserve' };
    } catch (err) {
      console.error(`[Booster] Reserve unavailable (${effectivePackId}/${rarity}):`, (err as Error).message);
    }
    if (!githubDown) {
      try {
        const dev = await sampler.drawDev(pool, rarity, exclude);
        if (dev) return { dev, source: 'github' };
      } catch (err) {
        if (err instanceof GitHubUnavailableError) githubDown = true;
        console.error(`[Booster] GitHub draw failed (${effectivePackId}/${rarity}):`, (err as Error).message);
      }
    }
    return { dev: await drawFromExistingCards(pool, rarity, exclude), source: 'fallback' };
  };

  // Slots are drawn in parallel (GitHub search calls are still queued and spaced in githubService)
  const slots = await Promise.all(pickedRarities.map(drawSlot));

  const drawn: DevStats[] = [];
  const sources: CardSource[] = [];
  for (const [i, slot] of slots.entries()) {
    let { dev, source } = slot;
    // Parallel draws can't see each other: redraw the rare same-dev collision
    const isTaken = (d: DevStats | null) => !!d && drawn.some(x => x.githubUsername === d.githubUsername);
    for (let retry = 0; isTaken(dev) && retry < 2; retry++) {
      ({ dev, source } = await drawSlot(pickedRarities[i]));
    }
    if (!dev || isTaken(dev)) continue;
    exclude.add(dev.githubUsername.toLowerCase());
    drawn.push(dev);
    sources.push(source);
  }

  const fallbackCount = sources.filter(s => s === 'fallback').length;
  if (fallbackCount > 0) {
    console.warn(`[Booster] ${fallbackCount}/${pickedRarities.length} cards of ${effectivePackId} were reused existing cards (GitHub unavailable, reserve empty)`);
  }

  // From here on the player is receiving cards: errors are logged, never thrown, so the
  // caller can't refund a pack that was already (partly) granted.
  const newCards = [];
  for (const [i, dev] of drawn.entries()) {
    try {
      const card = await upsertCard(dev, sources[i] !== 'fallback');
      const userCardResult = await addCardToUser(userId, card);
      newCards.push({
        ...dev,
        rarity: card.rarity,
        isShiny: userCardResult.isShiny,
        userCardId: userCardResult.id,
        isDuplicate: userCardResult.isDuplicate,
        fragmentsEarned: userCardResult.fragmentsEarned
      });
    } catch (err) {
      console.error(`[Booster] Could not grant ${dev.githubUsername}:`, (err as Error).message);
    }
  }
  let packsSinceLegendary: number | null = null;
  if (countsForPity) {
    // Final card rarity (star bonus included) decides whether the pity resets
    const gotLegendary = newCards.some(c => c.rarity === 'Legendary');
    pityTicket.settled = true;
    packsSinceLegendary = await updatePityCounter(userId, gotLegendary, pityTriggered);
  }
  try {
    await recordPulls(userId, effectivePackId, newCards.map(d => d.githubUsername));
  } catch (err) {
    console.error('[Booster] Could not record recent pulls:', (err as Error).message);
  }

  // Handle 15% Pack Drop for Fragments
  let packDropFragments = null;
  if (secureMathRandom() < 0.15 && newCards.length > 0) {
    // Determine language mapping
    let dropLang = pack?.themeLanguage;
    if (!dropLang) {
      // Find most common language in this pack context
      const langCounts: Record<string, number> = {};
      for (const c of newCards) {
        if (c.primaryLanguage && c.primaryLanguage !== 'Unknown') {
          langCounts[c.primaryLanguage] = (langCounts[c.primaryLanguage] || 0) + 1;
        }
      }
      const sortedLangs = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
      if (sortedLangs.length > 0) {
        dropLang = sortedLangs[0][0];
      }
    }

    if (dropLang && dropLang !== 'Unknown') {
      const dropAmount = 20; // Example standard pack drop amount
      packDropFragments = {
        language: dropLang,
        amount: dropAmount
      };
      try {
        await addFragments(userId, dropLang, dropAmount, `Pack drop - ${pack?.name || 'Generic Booster'}`);
      } catch (err) {
        packDropFragments = null;
        console.error('[Booster] Could not add pack-drop fragments:', (err as Error).message);
      }
    }
  }

  return {
    newCards,
    packDropFragments,
    pity: packsSinceLegendary === null ? null : { packsSinceLegendary, packsUntilGuaranteed: packsUntilPity(packsSinceLegendary), threshold: PITY_THRESHOLD, triggered: pityTriggered },
  };
}

/**
 * Claims a due pity atomically (resets the counter only if it is still due), so two
 * parallel openings can't both get the guaranteed Legendary.
 */
async function consumePity(userId: string): Promise<boolean> {
  try {
    const { count } = await prisma.user.updateMany({
      where: { id: userId, packsSinceLegendary: { gte: PITY_THRESHOLD - 1 } },
      data: { packsSinceLegendary: 0 },
    });
    return count === 1;
  } catch (err) {
    console.error('[Booster] Could not consume pity:', (err as Error).message);
    return false;
  }
}

/** Atomic counter update after the cards were granted. Never throws (the pack is already given). */
async function updatePityCounter(userId: string, gotLegendary: boolean, pityTriggered: boolean): Promise<number | null> {
  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { packsSinceLegendary: pityCounterUpdate(gotLegendary, pityTriggered) },
      select: { packsSinceLegendary: true },
    });
    return updated.packsSinceLegendary;
  } catch (err) {
    console.error('[Booster] Could not update the pity counter:', (err as Error).message);
    return null;
  }
}

/** Pity status for the store ("Legendary guaranteed within N packs"). */
export async function getPityStatus(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { packsSinceLegendary: true } });
  const packsSinceLegendary = user?.packsSinceLegendary ?? 0;
  return { packsSinceLegendary, packsUntilGuaranteed: packsUntilPity(packsSinceLegendary), threshold: PITY_THRESHOLD };
}

type CardSource = 'reserve' | 'github' | 'fallback';

/**
 * Last resort when the reserve is empty and GitHub can't answer (rate limit,
 * outage): an existing card of that rarity (and language, for language packs).
 */
async function drawFromExistingCards(pool: PoolFilter, rarity: Rarity, exclude: Set<string>): Promise<DevStats | null> {
  const languages = pool.languages ?? [];
  const cards = await prisma.card.findMany({
    where: {
      rarity,
      ...(languages.length ? { OR: languages.map(l => ({ primaryLanguage: { equals: l, mode: 'insensitive' as const } })) } : {}),
    },
  });
  const fresh = cards.filter(c => !exclude.has(c.githubUsername.toLowerCase()));
  const from = fresh.length > 0 ? fresh : cards;
  if (from.length === 0) return null;
  const card = from[randomInt(0, from.length)];
  return {
    ...card,
    avatarUrl: card.avatarUrl ?? '',
    primaryLanguage: card.primaryLanguage ?? 'Unknown',
    topLanguages: card.primaryLanguage ? [card.primaryLanguage] : [],
    followers: 0,
    totalStars: 0,
    starBonus: false,
  };
}

/** Max reserve rows drawn per rarity after one opening (keeps the background job short). */
const REFILL_PER_RARITY = 4;

/**
 * Tops the reserve of this booster back up after an opening. Meant to run after
 * the response is sent; spends the player's own GitHub quota when connected.
 */
export async function refillBoosterReserve(userId: string, packId: string | undefined, budgetMs = 40_000) {
  const pack = packId ? getPackById(packId) : null;
  if (!pack) return;
  const deadline = Date.now() + budgetMs;
  const sampler = samplerForToken(await getPlayerGithubToken(userId));
  const rarities: Rarity[] = pack.allCommon ? ['Common'] : ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
  try {
    for (const rarity of rarities) {
      const deficit = Math.min(REFILL_PER_RARITY, await reserveDeficit(pack.id, rarity));
      if (deficit > 0) await refillReserve(sampler, pack.id, pack.pool, rarity, deficit, deadline);
      if (Date.now() > deadline) break;
    }
  } catch (err) {
    console.error(`[Booster] Reserve refill for ${pack.id} stopped:`, (err as Error).message);
  }
}

async function addFragments(userId: string, language: string, amount: number, source: string) {
  await withUserLock(userId, async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { fragments: true, fragmentLogs: true } });
    if (!user) return;
    const fragments = asRecord(user.fragments);
    fragments[language] = (fragments[language] || 0) + amount;
    const logs = asArray(user.fragmentLogs);
    logs.unshift({ date: new Date().toISOString(), source, language, amount });
    await tx.user.update({ where: { id: userId }, data: { fragments, fragmentLogs: logs } });
  });
}

/** Creates the card, or refreshes its stats when the dev was just fetched live from GitHub. */
async function upsertCard(dev: DevStats, fresh: boolean) {
  const data = toCardData(dev);
  const existing = await prisma.card.findUnique({ where: { githubUsername: dev.githubUsername } });
  if (!existing) {
    try {
      return await prisma.card.create({ data });
    } catch (err) {
      // Another player drew the same new developer at the same moment
      if ((err as { code?: string }).code !== 'P2002') throw err;
      return prisma.card.findUniqueOrThrow({ where: { githubUsername: dev.githubUsername } });
    }
  }
  if (!fresh) return existing;
  return prisma.card.update({ where: { id: existing.id }, data });
}

async function addCardToUser(userId: string, card: { id: string; rarity: string; primaryLanguage: string | null }) {
  // Locked: two parallel openings must not both create the same card for the player
  const result = await withUserLock(userId, async (tx) => {
    const existingCard = await tx.userCard.findFirst({ where: { userId, cardId: card.id } });
    if (!existingCard) {
      const isShiny = secureMathRandom() < 0.05;
      const newCard = await tx.userCard.create({ data: { userId, cardId: card.id, isShiny } });
      return { isShiny, id: newCard.id, isDuplicate: false, fragmentsEarned: 0 };
    }
    return { isShiny: existingCard.isShiny, id: existingCard.id, isDuplicate: true, fragmentsEarned: 0 };
  });

  const lang = card.primaryLanguage || 'Unknown';
  if (result.isDuplicate && lang !== 'Unknown') {
    const amount = FRAGMENTS_PER_RARITY[card.rarity] || 5;
    await addFragments(userId, lang, amount, `Duplicate - ${card.rarity} ${lang} card`);
    return { ...result, fragmentsEarned: amount };
  }
  return result;
}
