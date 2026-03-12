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

const FRAGMENTS_PER_RARITY: Record<string, number> = {
  'Common': 5,
  'Uncommon': 10,
  'Rare': 20,
  'Epic': 40,
  'Legendary': 80
};

export async function openBoosterPack(userId: string, packId?: string) {
  const pack = packId ? getPackById(packId) : null;
  const cardsToPull = pack?.cardCount ?? 5;

  let pickedRarities: string[] = [];

  if (pack?.allCommon) {
    pickedRarities = Array(cardsToPull).fill('Common');
  } else {
    for (let i = 0; i < cardsToPull; i++) {
      pickedRarities.push(rollRarity());
    }
    if (pack?.guaranteedMinRarity) {
      pickedRarities = ensureMinimumRarity(pickedRarities, pack.guaranteedMinRarity);
    }
  }

  let newCards = [];

  if (pack) {
    const query = pack.buildQuery();
    const devs = await searchUsersForPack(query, cardsToPull);

    for (let i = 0; i < cardsToPull; i++) {
      let dev = devs[i];

      if (!dev) {
        const fallbacks = await getRandomDevelopersByRarity(pickedRarities[i], 1);
        dev = fallbacks[0];
      }

      if (dev) {
        const card = await upsertCard(dev);
        const userCardResult = await addCardToUser(userId, card);
        newCards.push({ 
          ...dev, 
          isShiny: userCardResult.isShiny, 
          userCardId: userCardResult.id,
          isDuplicate: userCardResult.isDuplicate,
          fragmentsEarned: userCardResult.fragmentsEarned
        });
      }
    }
  } else {
    const rarityCounts = pickedRarities.reduce((acc, curr) => {
      acc[curr] = (acc[curr] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    for (const [rarity, count] of Object.entries(rarityCounts)) {
      const devs = await getRandomDevelopersByRarity(rarity, count);
      for (const dev of devs) {
        const card = await upsertCard(dev);
        const userCardResult = await addCardToUser(userId, card);
        newCards.push({ 
          ...dev, 
          isShiny: userCardResult.isShiny, 
          userCardId: userCardResult.id,
          isDuplicate: userCardResult.isDuplicate,
          fragmentsEarned: userCardResult.fragmentsEarned
        });
      }
    }
  }

  // Handle 15% Pack Drop for Fragments
  let packDropFragments = null;
  if (Math.random() < 0.15 && newCards.length > 0) {
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
      
      const user = await prisma.user.findUnique({ where: { id: userId }});
      if (user) {
        const fragments = (user.fragments && typeof user.fragments === 'object' && !Array.isArray(user.fragments) ? user.fragments : {}) as Record<string, number>;
        fragments[dropLang] = (fragments[dropLang] || 0) + dropAmount;
        
        const logs = Array.isArray(user.fragmentLogs) ? [...user.fragmentLogs] : [];
        logs.unshift({
          date: new Date().toISOString(),
          source: `Pack drop - ${pack?.name || 'Generic Booster'}`,
          language: dropLang,
          amount: dropAmount
        });

        await prisma.user.update({
          where: { id: userId },
          data: { fragments, fragmentLogs: logs }
        });
      }
    }
  }

  return { newCards, packDropFragments };
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

async function addCardToUser(userId: string, card: any) {
  const existingCard = await prisma.userCard.findFirst({
    where: { userId, cardId: card.id }
  });

  const isShiny = Math.random() < 0.05;

  if (existingCard) {
    const lang = card.primaryLanguage || 'Unknown';
    if (lang !== 'Unknown') {
      const amount = FRAGMENTS_PER_RARITY[card.rarity] || 5;
      
      const user = await prisma.user.findUnique({ where: { id: userId }});
      if (user) {
        const fragments = (user.fragments && typeof user.fragments === 'object' && !Array.isArray(user.fragments) ? user.fragments : {}) as Record<string, number>;
        fragments[lang] = (fragments[lang] || 0) + amount;
        
        const logs = Array.isArray(user.fragmentLogs) ? [...user.fragmentLogs] : [];
        logs.unshift({
          date: new Date().toISOString(),
          source: `Duplicate - ${card.rarity} ${lang} card`,
          language: lang,
          amount: amount
        });

        await prisma.user.update({
          where: { id: userId },
          data: { fragments, fragmentLogs: logs }
        });

        return { isShiny: existingCard.isShiny, id: existingCard.id, isDuplicate: true, fragmentsEarned: amount, language: lang };
      }
    }
    return { isShiny: existingCard.isShiny, id: existingCard.id, isDuplicate: true, fragmentsEarned: 0, language: 'Unknown' };
  }

  const newCard = await prisma.userCard.create({
    data: { userId, cardId: card.id, isShiny }
  });
  return { isShiny, id: newCard.id, isDuplicate: false, fragmentsEarned: 0, language: card.primaryLanguage };
}
