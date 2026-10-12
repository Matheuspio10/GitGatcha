import { randomInt } from 'node:crypto';
import { prisma } from './prisma';
import { DevStats, GitHubUnavailableError, toCardData } from './githubService';
import { getPackById } from './packDefinitions';
import type { PoolFilter } from './devSampler';
import { devSampler, getRecentPulls, recordPulls } from './samplerStore';
import { isRarity, Rarity, rarityForSlot } from './rarity';
import { asArray, asRecord, withUserLock } from './userLock';

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
  const pack = packId ? getPackById(packId) : null;
  const effectivePackId = packId || '_generic';
  const cardsToPull = pack?.cardCount ?? 5;
  const pool: PoolFilter = pack?.pool ?? {};

  let pickedRarities: string[] = [];

  if (pack?.allCommon) {
    pickedRarities = Array(cardsToPull).fill('Common');
  } else {
    pickedRarities = getRaritiesForSlots(cardsToPull);
    if (pack?.guaranteedMinRarity) {
      pickedRarities = ensureMinimumRarity(pickedRarities, pack.guaranteedMinRarity);
    }
  }

  // Devs this player pulled from this booster type in the last 6h, plus the ones drawn in this pack
  const exclude = await getRecentPulls(userId, effectivePackId);
  let githubDown = false;

  const drawSlot = async (slotRarity: string): Promise<{ dev: DevStats | null; source: 'github' | 'fallback' }> => {
    const rarity: Rarity = isRarity(slotRarity) ? slotRarity : 'Common';
    if (!githubDown) {
      try {
        const dev = await devSampler.drawDev(pool, rarity, exclude);
        if (dev) return { dev, source: 'github' };
      } catch (err) {
        if (err instanceof GitHubUnavailableError) githubDown = true;
        console.error(`[Booster] GitHub draw failed (${effectivePackId}/${rarity}):`, (err as Error).message);
      }
    }
    return { dev: await drawFromFallback(effectivePackId, pool, rarity, exclude), source: 'fallback' };
  };

  // Slots are drawn in parallel (GitHub search calls are still queued and spaced in githubService)
  const slots = await Promise.all(pickedRarities.map(drawSlot));

  const drawn: DevStats[] = [];
  const sources: ('github' | 'fallback')[] = [];
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
    console.warn(`[Booster] ${fallbackCount}/${pickedRarities.length} cards of ${effectivePackId} came from the DB fallback pool`);
  }

  // From here on the player is receiving cards: errors are logged, never thrown, so the
  // caller can't refund a pack that was already (partly) granted.
  const newCards = [];
  for (const [i, dev] of drawn.entries()) {
    try {
      const card = await upsertCard(dev, sources[i] === 'github');
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

  return { newCards, packDropFragments };
}

/**
 * Used only when GitHub can't answer (rate limit, outage). Prefers the pool
 * pre-filled by the cron for this booster, which respects its filter.
 */
async function drawFromFallback(packId: string, pool: PoolFilter, rarity: Rarity, exclude: Set<string>): Promise<DevStats | null> {
  const pick = <T extends { githubUsername: string }>(rows: T[]): T | null => {
    const fresh = rows.filter(r => !exclude.has(r.githubUsername.toLowerCase()));
    const from = fresh.length > 0 ? fresh : rows;
    return from.length > 0 ? from[randomInt(0, from.length)] : null;
  };

  const pooled = pick(await prisma.boosterFallbackDev.findMany({ where: { packId, rarity } }));
  if (pooled) {
    return {
      ...pooled,
      avatarUrl: pooled.avatarUrl ?? '',
      primaryLanguage: pooled.primaryLanguage ?? 'Unknown',
      topLanguages: asArray<string>(pooled.topLanguages),
      followers: 0,
      totalStars: 0,
      starBonus: false,
    };
  }

  const languages = pool.languages ?? [];
  const card = pick(await prisma.card.findMany({
    where: {
      rarity,
      ...(languages.length ? { OR: languages.map(l => ({ primaryLanguage: { equals: l, mode: 'insensitive' as const } })) } : {}),
    },
  }));
  if (!card) return null;
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
