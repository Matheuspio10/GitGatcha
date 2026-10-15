import { prisma } from './prisma';
import { isReplayLog, withMaxHp, type ReplayCardJson, type ReplayData, type ReplayStat } from './battleReplay';

/** A finished battle as the public replay page shows it. */
export interface StoredReplay extends ReplayData {
  id: string;
  leagueMode: string;
  completedAt: string | null;
  challenger: { id: string; username: string | null };
  /** null against the computer (league battles and the Tower). */
  defender: { id: string; username: string | null } | null;
}

/**
 * The replay of a finished battle, or null when there is none: unknown id,
 * a challenge still open, or an old 1v1 battle that saved no turn log.
 */
export async function getStoredReplay(battleId: string): Promise<StoredReplay | null> {
  if (!battleId || battleId.length > 100) return null;
  const battle = await prisma.battle.findUnique({
    where: { id: battleId },
    select: {
      id: true,
      status: true,
      log: true,
      challengerTeam: true,
      defenderTeam: true,
      battleStats: true,
      winnerId: true,
      challengerId: true,
      leagueMode: true,
      completedAt: true,
      challenger: { select: { id: true, username: true } },
      defender: { select: { id: true, username: true } },
    },
  });
  if (!battle || battle.status !== 'COMPLETED' || !isReplayLog(battle.log)) return null;

  const challengerTeam = withMaxHp(battle.challengerTeam as ReplayCardJson[] | null);
  const defenderTeam = withMaxHp(battle.defenderTeam as ReplayCardJson[] | null);
  if (challengerTeam.length === 0 || defenderTeam.length === 0) return null;

  return {
    id: battle.id,
    log: battle.log,
    challengerTeam,
    defenderTeam,
    // Against the computer a loss is saved with the winner "__SYSTEM__"
    winnerSide: battle.winnerId === battle.challengerId ? 'CHALLENGER' : 'DEFENDER',
    battleStats: Array.isArray(battle.battleStats) ? battle.battleStats as unknown as ReplayStat[] : undefined,
    leagueMode: battle.leagueMode,
    completedAt: battle.completedAt?.toISOString() ?? null,
    challenger: battle.challenger,
    defender: battle.defender,
  };
}
