import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { addBits } from './bitsLedger';
import { UserFacingError } from './userLock';
import { resolve3v3Battle, getCardType, type BattleCard } from './battleResolver';
import { spendCardStamina } from './staminaService';
import { processPostBattleCardStats, type MilestoneUnlock } from './loyaltyService';
import { grantXP, XP_AMOUNTS } from './xpService';
import { utcWeekStart } from './missionUtils';
import type { PlayerTeamCard } from './playerTeam';
import {
  TOWER_FLOORS,
  TOWER_TOP_FLOOR,
  compareTowerRuns,
  floorTitle,
  seededPick,
  themeForWeek,
  towerName,
  type TowerFloor,
} from './tower';

const asJson = (value: unknown) => value as Prisma.InputJsonValue;
const cardSelect = { id: true, name: true, atk: true, def: true, hp: true, rarity: true, primaryLanguage: true, avatarUrl: true } as const;

/**
 * The opponents of a floor this week: drawn once (seeded by week and floor,
 * from the theme language when it has enough cards of that rarity) and stored,
 * so every player meets the same team all week.
 */
async function floorTeam(weekStart: Date, floor: TowerFloor, theme: string) {
  const stored = await prisma.towerFloorTeam.findUnique({ where: { weekStart_floor: { weekStart, floor: floor.floor } } });
  let cardIds = stored?.cardIds;
  if (!cardIds) {
    cardIds = [];
    const seed = `${weekStart.toISOString()}|${floor.floor}`;
    for (const [slot, rarity] of floor.rarities.entries()) {
      const themed = await prisma.card.findMany({ where: { rarity, primaryLanguage: theme }, select: { id: true }, orderBy: { id: 'asc' } });
      const pool = (themed.length >= 3 ? themed : await prisma.card.findMany({ where: { rarity }, select: { id: true }, orderBy: { id: 'asc' } }))
        .map(c => c.id)
        .filter(id => !cardIds!.includes(id));
      // The final boss: the strongest cards of the pool, not random ones
      const pick = floor.boss === 'final'
        ? (await prisma.card.findMany({ where: { id: { in: pool } }, select: { id: true, atk: true, def: true, hp: true } }))
            .sort((a, b) => (b.atk + b.def + b.hp) - (a.atk + a.def + a.hp))[slot]?.id
        : seededPick(pool, 1, `${seed}|${slot}`)[0];
      if (pick) cardIds.push(pick);
    }
    if (cardIds.length < 3) throw new UserFacingError('tower.notReady', 503);
    try {
      await prisma.towerFloorTeam.create({ data: { weekStart, floor: floor.floor, theme, cardIds } });
    } catch (err) {
      // Someone drew it at the same moment: use theirs
      if ((err as { code?: string }).code !== 'P2002') throw err;
      cardIds = (await prisma.towerFloorTeam.findUniqueOrThrow({ where: { weekStart_floor: { weekStart, floor: floor.floor } } })).cardIds;
    }
  }
  const cards = await prisma.card.findMany({ where: { id: { in: cardIds } }, select: cardSelect });
  return cardIds.map(id => cards.find(c => c.id === id)).filter(c => !!c);
}

/** The player's climb this week, the next floor (with its opponents) and the weekly ranking. */
export async function getTowerState(userId: string, now = new Date()) {
  const weekStart = utcWeekStart(now);
  const theme = themeForWeek(weekStart);
  const run = await prisma.towerRun.findUnique({ where: { userId_weekStart: { userId, weekStart } } });
  const cleared = run?.cleared ?? 0;
  const next = TOWER_FLOORS[cleared] ?? null;
  const opponents = next ? await floorTeam(weekStart, next, theme) : [];

  const runs = await prisma.towerRun.findMany({
    where: { weekStart, cleared: { gt: 0 } },
    select: { userId: true, cleared: true, attempts: true, updatedAt: true, user: { select: { username: true } } },
  });
  const ranking = runs.sort(compareTowerRuns).slice(0, 20).map(r => ({ username: r.user.username, cleared: r.cleared, attempts: r.attempts, isYou: r.userId === userId }));

  return {
    weekStart,
    resetsAt: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000),
    theme,
    name: towerName(theme),
    cleared,
    attempts: run?.attempts ?? 0,
    floors: TOWER_FLOORS.map(f => ({ ...f, title: floorTitle(f, theme) })),
    next: next ? { ...next, title: floorTitle(next, theme), opponents: opponents.map(c => ({ name: c.name, rarity: c.rarity, primaryLanguage: c.primaryLanguage, avatarUrl: c.avatarUrl })) } : null,
    ranking,
  };
}

const toBattleCard = (c: { id: string; name: string; atk: number; def: number; hp: number; rarity: string; primaryLanguage: string | null; avatarUrl: string | null }, stamina: number, loyaltyTier = 'none', trainingLevel = 0): BattleCard => ({
  id: c.id, name: c.name, atk: c.atk, def: c.def, hp: c.hp, maxHp: c.hp, stamina,
  rarity: c.rarity as BattleCard['rarity'], primaryLanguage: c.primaryLanguage, type: getCardType(c), avatarUrl: c.avatarUrl, loyaltyTier, trainingLevel,
});

/**
 * Fights the next floor of this week's tower. Every fight counts as an attempt;
 * a win clears the floor and pays its BITS (once per week, the run only moves
 * up one floor at a time).
 */
export async function fightTower(userId: string, team: PlayerTeamCard[], now = new Date()) {
  const weekStart = utcWeekStart(now);
  const theme = themeForWeek(weekStart);
  const run = await prisma.towerRun.upsert({
    where: { userId_weekStart: { userId, weekStart } },
    create: { userId, weekStart },
    update: {},
  });
  const floor = TOWER_FLOORS[run.cleared];
  if (!floor) throw new UserFacingError('tower.alreadyConquered', 400, { theme });

  const opponents = await floorTeam(weekStart, floor, theme);
  const cTeam = team.map(c => toBattleCard(c, c.stamina, c.loyaltyTier, c.trainingLevel));
  const dTeam = opponents.map(c => toBattleCard(c, 100));
  const result = resolve3v3Battle(cTeam, dTeam);
  const won = result.winner === 'CHALLENGER';
  const xp = won ? XP_AMOUNTS.WIN_BATTLE_RANDOM : Math.round(XP_AMOUNTS.WIN_BATTLE_RANDOM / 3);

  const { battle, firstClear } = await prisma.$transaction(async (tx) => {
    const created = await tx.battle.create({
      data: {
        challengerId: userId,
        defenderId: null,
        challengerTeam: asJson(cTeam),
        defenderTeam: asJson(dTeam),
        log: asJson(result.log),
        status: 'COMPLETED',
        isRandom: true,
        leagueMode: 'TOWER',
        battleStats: asJson([]),
        winnerId: won ? userId : '__SYSTEM__',
        rewardBits: won ? floor.rewardBits : 0,
        completedAt: now,
      },
    });
    // Moves up only from the floor this fight was for (two parallel wins pay once)
    const moved = won
      ? (await tx.towerRun.updateMany({ where: { id: run.id, cleared: floor.floor - 1 }, data: { cleared: floor.floor, attempts: { increment: 1 } } })).count === 1
      : false;
    if (!moved) await tx.towerRun.update({ where: { id: run.id }, data: { attempts: { increment: 1 } } });
    if (moved) await addBits(userId, floor.rewardBits, 'tower_reward', { tx, detail: `${towerName(theme)} · floor ${floor.floor}` });
    return { battle: created, firstClear: moved };
  });

  const safe = async <T>(label: string, fallback: T, fn: () => Promise<T>) => {
    try { return await fn(); } catch (err) { console.error(`[Tower ${battle.id}] ${label} failed:`, (err as Error).message); return fallback; }
  };
  const xpResult = await safe('XP', null, () => grantXP(userId, xp));
  await safe('Stamina', undefined, () => spendCardStamina(team.map(c => c.id)));
  const unlocksMap = await safe('Loyalty', new Map<string, MilestoneUnlock[]>(), () => processPostBattleCardStats(cTeam.map(c => {
    const s = result.challengerTeamState.find(cs => cs.id === c.id);
    return { userCardId: c.id, damageDealt: s?.statsDealtDamage || 0, won, critsLanded: s?.statsCritsLanded || 0, passivesTriggered: s?.statsPassivesTriggered || 0 };
  })));

  return {
    battleId: battle.id,
    challengerTeam: cTeam,
    defenderTeam: dTeam,
    winnerSide: result.winner,
    log: result.log,
    rewards: { bits: firstClear ? floor.rewardBits : 0, xp },
    xpResult,
    loyaltyUnlocks: cTeam.map(c => ({ cardId: c.id, cardName: c.name, milestones: unlocksMap.get(c.id) ?? [] })).filter(u => u.milestones.length > 0),
    tower: { floor: floor.floor, title: floorTitle(floor, theme), cleared: firstClear, top: floor.floor === TOWER_TOP_FLOOR && firstClear },
  };
}
