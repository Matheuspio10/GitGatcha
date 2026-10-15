import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCardType } from '@/lib/battleResolver';
import { getCardStamina } from '@/lib/staminaService';
import { asJson, withUserLock, UserFacingError } from '@/lib/userLock';
import { spendBits } from '@/lib/bitsLedger';
import { CHALLENGE_TTL_HOURS } from '@/lib/battleConfig';
import { OPEN_CHALLENGE } from '@/lib/challenges';
import { areFriends, expireChallenges, parseStake } from '@/lib/challengeService';
import { teamCardIdsSchema } from '@/lib/playerTeam';
import { apiError, readBody, routeError } from '@/lib/apiResponse';
import { z } from 'zod';

const bodySchema = z.object({
  defenderUsername: z.string().max(100).optional(),
  cardIds: teamCardIdsSchema,
  // A number from the stake field; parseStake checks the range (and accepts a numeric string or empty)
  stake: z.union([z.number(), z.string().max(20), z.null()]).optional(),
  open: z.boolean().optional(),
});

/** Challenges that still hold their challenger's cards. */
const OPEN_CHALLENGE_STATUSES = ['PENDING', 'RESOLVING'];

/** What a player may see of a team before the battle: no stats, no card ids. */
function summarizeTeam(team: unknown) {
  const cards = Array.isArray(team) ? (team as { rarity?: string }[]) : [];
  return {
    count: cards.length,
    rarities: cards.map(c => c.rarity || 'Common').sort(),
  };
}

// POST: Create a friend challenge (challenger picks their 3-card team)
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return apiError('common.unauthorized', 401);

    const body = await readBody(req, bodySchema);
    if (!body.ok) return body.response;
    const { defenderUsername, cardIds, stake: rawStake, open: openRequest } = body.data;
    // Open challenge: no defender yet, anyone with the link may accept it
    const open = openRequest === true || defenderUsername === OPEN_CHALLENGE;
    const stake = parseStake(rawStake);

    // Direct challenges are between friends only
    let defender: { id: string; username: string | null } | null = null;
    if (!open) {
      defender = defenderUsername
        ? await prisma.user.findUnique({ where: { username: defenderUsername }, select: { id: true, username: true } })
        : null;
      if (!defender) return apiError('challenge.playerNotFound', 404);
      if (defender.id === userId) return apiError('challenge.cannotChallengeSelf');
      if (!(await areFriends(userId, defender.id))) {
        return apiError('challenge.friendsOnly', 403);
      }
    }

    // Verify card ownership and build team payload
    const uniqueCardIds = Array.from(new Set(cardIds));
    const userCards = await prisma.userCard.findMany({
      where: { userId, cardId: { in: uniqueCardIds } },
      include: { card: true },
    });

    const requiredCounts: Record<string, number> = {};
    for (const id of cardIds) {
      requiredCounts[id] = (requiredCounts[id] || 0) + 1;
    }

    const ownedCounts: Record<string, number> = {};
    for (const uc of userCards) {
      ownedCounts[uc.cardId] = (ownedCounts[uc.cardId] || 0) + 1;
    }

    for (const [id, count] of Object.entries(requiredCounts)) {
      if (!ownedCounts[id] || ownedCounts[id] < count) {
        return apiError('team.cardsNotOwned', 404);
      }
    }

    // Preserve chosen card order
    // Validate stamina
    for (const id of cardIds) {
      const uc = userCards.find(u => u.cardId === id);
      if (uc) {
        const currentStamina = getCardStamina(uc);
        if (currentStamina === 0) {
          return apiError('team.cardExhausted', 400, { name: uc.card.name });
        }
      }
    }

    const challengerTeam = cardIds.map(id => {
      const uc = userCards.find(u => u.cardId === id)!;
      const c = uc.card;
      return {
        id: uc.id, // Store userCardId as id so we can deduct stamina later
        cardId: c.id,
        name: c.name,
        avatarUrl: c.avatarUrl,
        atk: c.atk,
        def: c.def,
        hp: c.hp,
        maxHp: c.hp,
        stamina: getCardStamina(uc),
        rarity: c.rarity,
        primaryLanguage: c.primaryLanguage,
        type: getCardType(c),
        loyaltyTier: uc.loyaltyTier || 'none',
        trainingLevel: uc.trainingLevel,
      };
    });

    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_HOURS * 60 * 60 * 1000);

    // A card can only be committed to one open challenge at a time. Checked and
    // created under the challenger's lock so two parallel requests can't both pass.
    const teamUserCardIds = challengerTeam.map(c => c.id);
    const battle = await withUserLock(userId, async (tx) => {
      const openChallenges = await tx.battle.findMany({
        where: {
          challengerId: userId,
          status: { in: OPEN_CHALLENGE_STATUSES },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { challengerTeam: true },
      });
      const busy = new Set<string>();
      for (const ch of openChallenges) {
        for (const c of (Array.isArray(ch.challengerTeam) ? ch.challengerTeam : []) as { id?: string }[]) {
          if (c?.id) busy.add(c.id);
        }
      }
      const busyCard = challengerTeam.find(c => busy.has(c.id));
      if (busyCard) {
        throw new UserFacingError('challenge.cardBusy', 409, { name: busyCard.name });
      }
      if (new Set(teamUserCardIds).size !== teamUserCardIds.length) {
        throw new UserFacingError('team.duplicateCard');
      }

      // The challenger's stake is held until the challenge resolves, expires or is cancelled
      if (stake > 0) {
        const paid = await spendBits(userId, stake, 'challenge_stake', { tx, detail: defender ? `Challenge vs ${defender.username}` : 'Open challenge' });
        if (paid === null) throw new UserFacingError('challenge.stakeNotAffordable', 400, { stake });
      }

      return tx.battle.create({
        data: {
          challengerId: userId,
          defenderId: defender?.id ?? null,
          challengerTeam: asJson(challengerTeam),
          status: 'PENDING',
          isRandom: false,
          expiresAt,
          stake,
          isOpen: open,
        },
        include: {
          challenger: { select: { id: true, username: true, image: true } },
        },
      });
    });

    return NextResponse.json({ success: true, battle });

  } catch (error) {
    return routeError(error, 'challenge.createFailed', 'Challenge creation error');
  }
}

// GET: Get pending challenges for current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return apiError('common.unauthorized', 401);

    // Expire old challenges (stakes go back to their challengers)
    await expireChallenges();

    // Fetch incoming challenges. The defender only gets a summary of the
    // challenger's team: exposing stats/languages/card ids before they pick
    // their own team would let them build a counter from the devtools.
    const incomingRaw = await prisma.battle.findMany({
      where: { defenderId: userId, status: 'PENDING' },
      select: {
        id: true, status: true, createdAt: true, expiresAt: true, challengerTeam: true, stake: true,
        challenger: { select: { id: true, username: true, image: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const incoming = incomingRaw.map(({ challengerTeam, ...b }) => ({ ...b, challengerTeam: summarizeTeam(challengerTeam) }));

    // Fetch outgoing challenges
    const outgoingRaw = await prisma.battle.findMany({
      where: { challengerId: userId, status: 'PENDING' },
      select: {
        id: true, status: true, createdAt: true, expiresAt: true, challengerTeam: true, stake: true, isOpen: true,
        defender: { select: { id: true, username: true, image: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const outgoing = outgoingRaw.map(({ challengerTeam, ...b }) => ({ ...b, challengerTeam: summarizeTeam(challengerTeam) }));

    return NextResponse.json({ incoming, outgoing });

  } catch (error) {
    console.error('Challenge fetch error:', error);
    return apiError('challenge.fetchFailed', 500);
  }
}
