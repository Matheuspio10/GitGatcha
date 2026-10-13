/**
 * New-player onboarding (pure, client-safe).
 *
 * When a player picks their username they get a starter pack and a 4-step
 * "Getting started" checklist: open the pack → look at the collection → save a
 * team of 3 → fight a battle. Each step pays BITS once, claimed from the
 * checklist. Players from before the onboarding existed have no state (null)
 * and never see it.
 *
 * Progress is read from data the game already has (cards, active team,
 * battles); only "visited the collection" is stored.
 */

export const STARTER_PACK_ID = 'open-source-heroes';

/**
 * BITS every new account starts with, whatever the sign-up method. E-mail sign-ups
 * set it explicitly; Google/GitHub accounts get it from the User.currency default
 * in schema.prisma, which must stay equal.
 */
export const STARTING_BITS = 1000;

export type OnboardingStepId = 'open-pack' | 'collection' | 'team' | 'battle';

export interface OnboardingStepDef {
  id: OnboardingStepId;
  title: string;
  description: string;
  /** Where the "Go" button leads. */
  href: string;
  rewardBits: number;
}

export const ONBOARDING_STEPS: readonly OnboardingStepDef[] = [
  { id: 'open-pack', title: 'Open your starter pack', description: 'Tear it open in your inventory: a Rare or better is guaranteed.', href: '/inventory', rewardBits: 50 },
  { id: 'collection', title: 'Meet your developers', description: 'Look at your new cards in the collection.', href: '/collection', rewardBits: 50 },
  { id: 'team', title: 'Build a team of 3', description: 'Pick 3 cards in the Arena team builder.', href: '/battle', rewardBits: 100 },
  { id: 'battle', title: 'Fight your first battle', description: 'Take your team into any league. Win or lose, it counts.', href: '/battle', rewardBits: 200 },
];

/** Stored in User.onboarding (null = player from before the onboarding). */
export interface OnboardingState {
  startedAt: string;
  welcomeSeen?: boolean;
  collectionSeen?: boolean;
  claimed?: OnboardingStepId[];
  dismissed?: boolean;
  /** Cards of the free pack opened as a visitor that joined the account (shown on the welcome screen). */
  guestCards?: number;
}

/** Facts about the player's account that complete the steps. */
export interface OnboardingProgress {
  boosterCards: number;
  collectionSeen: boolean;
  activeTeamCards: number;
  battles: number;
}

export interface OnboardingStepView extends OnboardingStepDef {
  done: boolean;
  claimed: boolean;
}

export interface OnboardingView {
  steps: OnboardingStepView[];
  /** Every step claimed. */
  complete: boolean;
  dismissed: boolean;
}

export function isStepDone(id: OnboardingStepId, p: OnboardingProgress): boolean {
  switch (id) {
    case 'open-pack': return p.boosterCards > 0;
    case 'collection': return p.collectionSeen;
    case 'team': return p.activeTeamCards >= 3;
    case 'battle': return p.battles > 0;
  }
}

export function parseOnboardingState(value: unknown): OnboardingState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.startedAt !== 'string') return null;
  const ids = ONBOARDING_STEPS.map(s => s.id) as string[];
  return {
    startedAt: v.startedAt,
    welcomeSeen: v.welcomeSeen === true,
    collectionSeen: v.collectionSeen === true,
    claimed: Array.isArray(v.claimed) ? (v.claimed.filter(id => ids.includes(id as string)) as OnboardingStepId[]) : [],
    dismissed: v.dismissed === true,
    guestCards: typeof v.guestCards === 'number' ? v.guestCards : 0,
  };
}

export function buildOnboardingView(state: OnboardingState, progress: OnboardingProgress): OnboardingView {
  const claimed = new Set(state.claimed ?? []);
  const steps = ONBOARDING_STEPS.map(step => ({
    ...step,
    claimed: claimed.has(step.id),
    done: claimed.has(step.id) || isStepDone(step.id, progress),
  }));
  return { steps, complete: steps.every(s => s.claimed), dismissed: !!state.dismissed };
}

export const ONBOARDING_TOTAL_BITS = ONBOARDING_STEPS.reduce((sum, s) => sum + s.rewardBits, 0);
