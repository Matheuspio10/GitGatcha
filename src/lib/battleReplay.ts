import type { BattleLogEvent, TurnLog } from './battleResolver';

/**
 * Battle replays: the turn-by-turn log every 3v3 battle saves (Battle.log),
 * played back by <BattleReplay>. Pure and client-safe; the database side is
 * battleReplayService.ts.
 */

export type ReplayEvent = BattleLogEvent;
export type ReplayTurn = TurnLog;
export type ReplaySide = 'CHALLENGER' | 'DEFENDER';

/** A card on the replay field (the battle's team snapshot). */
export interface ReplayCard {
  id: string;
  name: string;
  atk: number;
  def: number;
  hp: number;
  maxHp: number;
  rarity: string;
  primaryLanguage?: string | null;
  avatarUrl?: string | null;
}

/** A team card as an API or Battle row has it: older battles saved no maxHp. */
export type ReplayCardJson = Omit<ReplayCard, 'maxHp'> & { maxHp?: number };

/** One card's line in the results summary (battleService buildBattleStats). */
export interface ReplayStat {
  cardId: string;
  name: string;
  team: ReplaySide;
  damageDealt: number;
  damageReceived: number;
  passivesTriggered: number;
  critsLanded: number;
  momentumAchieved: boolean;
}

/** What the replay needs to play a battle back. */
export interface ReplayData {
  log: ReplayTurn[];
  challengerTeam: ReplayCard[];
  defenderTeam: ReplayCard[];
  winnerSide: ReplaySide;
  battleStats?: ReplayStat[];
}

export const withMaxHp = (cards: ReplayCardJson[] | null | undefined): ReplayCard[] =>
  (cards ?? []).map(c => ({ ...c, maxHp: c.maxHp || c.hp }));

/**
 * True when a saved log can be played back: the 3v3 turn list. Battles from
 * the old 1v1 system saved no log (null) and have no replay.
 */
export function isReplayLog(log: unknown): log is ReplayTurn[] {
  return Array.isArray(log) && log.length > 0 && log.every(turn =>
    !!turn && typeof turn === 'object'
    && typeof (turn as ReplayTurn).cCardId === 'string'
    && typeof (turn as ReplayTurn).dCardId === 'string'
    && Array.isArray((turn as ReplayTurn).events));
}

const otherSide = (side: ReplaySide): ReplaySide => (side === 'CHALLENGER' ? 'DEFENDER' : 'CHALLENGER');

/**
 * The same battle seen from the defender's chair: the replay always plays the
 * viewer's team at the bottom as the "challenger" side.
 */
export function swapSides<T extends ReplayData>(replay: T): T {
  return {
    ...replay,
    log: replay.log.map(turn => ({
      ...turn,
      cCardId: turn.dCardId,
      dCardId: turn.cCardId,
      cHpStart: turn.dHpStart,
      dHpStart: turn.cHpStart,
      cHpEnd: turn.dHpEnd,
      dHpEnd: turn.cHpEnd,
    })),
    challengerTeam: replay.defenderTeam,
    defenderTeam: replay.challengerTeam,
    winnerSide: otherSide(replay.winnerSide),
    battleStats: replay.battleStats?.map(s => ({ ...s, team: otherSide(s.team) })),
  };
}

/**
 * The final score: how many of the other side's cards each side knocked out
 * (the same count the replay's score pill ends on).
 */
export function knockouts(log: ReplayTurn[]): { challenger: number; defender: number } {
  const cHp = new Map<string, number>();
  const dHp = new Map<string, number>();
  for (const turn of log) {
    // The opening and closing turns (battle_start / battle_end) have no cards on the field
    if (turn.cCardId) cHp.set(turn.cCardId, turn.cHpEnd);
    if (turn.dCardId) dHp.set(turn.dCardId, turn.dHpEnd);
  }
  const down = (hp: Map<string, number>) => [...hp.values()].filter(v => v <= 0).length;
  return { challenger: down(dHp), defender: down(cHp) };
}

/** Public link of a battle's replay. */
export const replayPath = (battleId: string) => `/replay/${battleId}`;
