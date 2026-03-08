import { prisma } from './prisma';
import { getRandomDevelopersByRarity, searchUsersForPack } from './githubService';
import { getPackById } from './packDefinitions';

const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

function rollRarity(): string {
  const roll = Math.random() * 100;
  if (roll < 0.3) return 'Legendary';  // 0.3%  (was 1%)
  if (roll < 2.3) return 'Epic';       // 2%    (was 4%)
  if (roll < 10.3) return 'Rare';      // 8%    (was 10%)
  if (roll < 30.3) return 'Uncommon';  // 20%   (was 25%)
  return 'Common';                     // ~69.7% (was 60%)
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

export async function openBoosterPack(userId: string, packId?: string) {
  const pack = packId ? getPackById(packId) : null;
  const cardsToPull = pack?.cardCount ?? 5;

  let pickedRarities: string[] = [];

  if (pack?.allCommon) {
    // Junk Drawer: all Common
    pickedRarities = Array(cardsToPull).fill('Common');
  } else {
    // Roll rarities
    for (let i = 0; i < cardsToPull; i++) {
      pickedRarities.push(rollRarity());
    }

    // Ensure guaranteed minimum rarity
    if (pack?.guaranteedMinRarity) {
      pickedRarities = ensureMinimumRarity(pickedRarities, pack.guaranteedMinRarity);
    }
  }

  let newCards = [];

  if (pack) {
    // Use pack-specific query to get users
    const query = pack.buildQuery();
    const devs = await searchUsersForPack(query, cardsToPull);

    // If we got enough users, use them; otherwise fill with rarity-based fallback
    for (let i = 0; i < cardsToPull; i++) {
      let dev = devs[i];

      if (!dev) {
        // Fallback: get by rarity
        const fallbacks = await getRandomDevelopersByRarity(pickedRarities[i], 1);
        dev = fallbacks[0];
      }

      if (dev) {
        // Override rarity based on our roll (except for pack-specific packs
        // where the user pool IS the filter, so we keep their calculated rarity
        // unless we need to enforce minimum)
        const card = await upsertCard(dev);
        const userCard = await addCardToUser(userId, card.id);
        newCards.push({ ...dev, isShiny: userCard.isShiny, userCardId: userCard.id });
      }
    }
  } else {
    // Generic booster (legacy path): use rarity-based queries
    const rarityCounts = pickedRarities.reduce((acc, curr) => {
      acc[curr] = (acc[curr] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    for (const [rarity, count] of Object.entries(rarityCounts)) {
      const devs = await getRandomDevelopersByRarity(rarity, count);
      for (const dev of devs) {
        const card = await upsertCard(dev);
        await addCardToUser(userId, card.id);
        newCards.push(dev);
      }
    }
  }

  return newCards;
}

async function upsertCard(dev: any) {
  let card = await prisma.card.findUnique({
    where: { githubUsername: dev.githubUsername }
  });

  if (!card) {
    card = await prisma.card.create({ data: dev });
  }

  return card;
}

async function addCardToUser(userId: string, cardId: string) {
  const isShiny = Math.random() < 0.05; // 5% chance
  return await prisma.userCard.create({
    data: { userId, cardId, isShiny }
  });
}
