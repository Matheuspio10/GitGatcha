/** Why BITS changed (BitsTransaction.reason) and how the history names it. Client-safe. */
export const BITS_REASONS = {
  opening_balance: 'Balance when the history started',
  starting_bits: 'Welcome BITS',
  pack_purchase: 'Booster purchase',
  forge: 'Forge invocation',
  stamina_recover: 'Stamina recovery',
  league_entry: 'League entry fee',
  league_refund: 'League fee refunded',
  battle_reward: 'Battle reward',
  mission: 'Mission reward',
  daily_login: 'Daily reward',
  level_up: 'Level up',
  achievement: 'Achievement',
  github_link: 'GitHub connected',
  share_bonus: 'First share',
  onboarding: 'Getting started',
  referral: 'Invite reward',
  rank_promotion: 'Rank promotion',
  season_reward: 'Season reward',
  challenge_stake: 'Challenge stake',
  challenge_payout: 'Challenge won (stakes)',
  challenge_refund: 'Challenge stake refunded',
  tower_reward: 'Tower floor cleared',
  sprint_reward: 'Sprint reward',
} as const;

export type BitsReason = keyof typeof BITS_REASONS;

export function bitsReasonLabel(reason: string): string {
  return (BITS_REASONS as Record<string, string>)[reason] ?? reason;
}
