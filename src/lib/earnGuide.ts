/**
 * "How to earn BITS and packs" for the welcome screen (server only: it reads
 * the reward constants, so the text never drifts from the real numbers).
 */
import { LOGIN_CALENDAR_DAYS, LOGIN_CALENDAR_REWARDS } from './loginCalendar';
import { DAILY_MISSION_COUNT, WEEKLY_MISSION_COUNT } from './missionUtils';
import { UPSET_BONUS } from './battleConfig';
import { ACHIEVEMENTS } from './achievementUtils';
import { GITHUB_LINK_BONUS } from './githubLink';
import { ONBOARDING_TOTAL_BITS } from './onboarding';
import { PITY_THRESHOLD } from './pity';

export type EarnIcon = 'checklist' | 'calendar' | 'target' | 'swords' | 'level' | 'trophy' | 'github' | 'forge' | 'shield';

export interface EarnWay {
  icon: EarnIcon;
  title: string;
  text: string;
  href: string;
}

export function buildEarnGuide(username: string): EarnWay[] {
  const first = LOGIN_CALENDAR_REWARDS[0];
  const last = LOGIN_CALENDAR_REWARDS[LOGIN_CALENDAR_REWARDS.length - 1];
  return [
    { icon: 'checklist', title: 'Getting started', text: `The checklist in the corner pays ${ONBOARDING_TOTAL_BITS} BITS for your first steps.`, href: '/inventory' },
    { icon: 'calendar', title: 'Daily reward', text: `Claim it in the Store every day: ${first.bits} to ${last.bits} BITS over a ${LOGIN_CALENDAR_DAYS}-day streak${last.packName ? `, plus ${last.packName} on day ${LOGIN_CALENDAR_DAYS}` : ''}.`, href: '/store' },
    { icon: 'target', title: 'Missions', text: `${DAILY_MISSION_COUNT} new missions every day (swap one if you don't like it), ${WEEKLY_MISSION_COUNT} bigger ones every week, and a dev mission for real GitHub activity once you connect GitHub.`, href: '/store' },
    { icon: 'swords', title: 'Battles', text: `Battles pay BITS and XP (most leagues pay a little even on a loss). Beat a stronger team for up to +${Math.round(UPSET_BONUS.max * 100)}% BITS.`, href: '/battle' },
    { icon: 'level', title: 'Level ups', text: 'XP from packs and battles levels you up, and new levels give BITS and free boosters.', href: '/inventory' },
    { icon: 'trophy', title: 'Achievements', text: `${ACHIEVEMENTS.length} achievements with Bronze, Silver and Gold rewards.`, href: `/profile/${encodeURIComponent(username)}` },
    { icon: 'github', title: 'Connect GitHub', text: `+${GITHUB_LINK_BONUS} BITS and your own Signature card, which never drops from packs.`, href: `/profile/${encodeURIComponent(username)}` },
    { icon: 'forge', title: 'Duplicates and the Forge', text: 'Repeated cards turn into fragments; spend them in the Forge on the developer you want.', href: '/forge' },
    { icon: 'shield', title: 'Legendary pity', text: `A Legendary is guaranteed at least once every ${PITY_THRESHOLD} packs.`, href: '/store' },
  ];
}
