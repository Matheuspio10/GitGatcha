import { LEAGUES, isLeagueMode } from './battleConfig';

export interface OpponentCandidate {
  id: string;
  atk: number;
  def: number;
  hp: number;
  rarity: string;
  primaryLanguage: string | null;
}

export const OPPONENT_TEAM_SIZE = 3;

export function cardPower(c: { atk: number; def: number; hp: number }): number {
  return c.atk + c.def + c.hp;
}

function hasLanguage(c: OpponentCandidate): boolean {
  return !!c.primaryLanguage && c.primaryLanguage !== 'Unknown';
}

/** True if a single card may appear in a team of `leagueMode`. */
export function isCandidateAllowed(c: OpponentCandidate, leagueMode: string, powerCap?: number): boolean {
  const league = LEAGUES[isLeagueMode(leagueMode) ? leagueMode : 'OPEN'];
  if (league.allowedRarities && !league.allowedRarities.includes(c.rarity)) return false;
  if (leagueMode === 'DIVERSITY' && !hasLanguage(c)) return false;
  if (leagueMode === 'BALANCED' && powerCap !== undefined && cardPower(c) > powerCap) return false;
  return true;
}

/**
 * Picks the computer's team: 3 distinct cards drawn uniformly at random from
 * `candidates` that obey the same league restrictions as the player's team
 * (rarity, 3 different languages, power cap). Returns null when the
 * candidates can't form a valid team.
 */
export function pickOpponentTeam<T extends OpponentCandidate>(
  candidates: T[],
  leagueMode: string,
  options: { powerCap?: number; random?: () => number } = {}
): T[] | null {
  const random = options.random ?? Math.random;
  const { powerCap } = options;

  const seen = new Set<string>();
  const pool = candidates.filter(c => {
    if (seen.has(c.id) || !isCandidateAllowed(c, leagueMode, powerCap)) return false;
    seen.add(c.id);
    return true;
  });

  // Fisher–Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const minPower = pool.reduce((m, c) => Math.min(m, cardPower(c)), Infinity);
  const team: T[] = [];
  const languages = new Set<string>();
  let power = 0;

  for (const c of pool) {
    if (team.length === OPPONENT_TEAM_SIZE) break;
    if (leagueMode === 'DIVERSITY' && languages.has(c.primaryLanguage as string)) continue;
    if (leagueMode === 'BALANCED' && powerCap !== undefined) {
      // Leave room for the remaining slots, filled with at least the weakest card
      const slotsLeftAfter = OPPONENT_TEAM_SIZE - team.length - 1;
      if (power + cardPower(c) + slotsLeftAfter * minPower > powerCap) continue;
    }
    team.push(c);
    languages.add(c.primaryLanguage as string);
    power += cardPower(c);
  }

  return team.length === OPPONENT_TEAM_SIZE ? team : null;
}
