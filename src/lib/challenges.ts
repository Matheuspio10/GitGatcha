/** Client-safe challenge constants. */

/** Pseudo-username for "anyone with the link" in the challenge friend picker. */
export const OPEN_CHALLENGE = '*link*';

export function challengeLink(origin: string, battleId: string): string {
  return `${origin}/challenge/${battleId}`;
}
