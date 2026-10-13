import { Prisma } from '@prisma/client';
import { addBits } from './bitsLedger';
import { prisma } from './prisma';
import { Tx, UserFacingError, asArray, withUserLock } from './userLock';
import { getPackById } from './packDefinitions';
import type { InventoryItem } from './xpService';
import { SIGNATURE_EDITION } from './githubLink';
import {
  ONBOARDING_STEPS,
  OnboardingState,
  OnboardingStepId,
  OnboardingView,
  STARTER_PACK_ID,
  buildOnboardingView,
  isStepDone,
  parseOnboardingState,
} from './onboarding';

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

/**
 * Starts the onboarding of a player who just picked their username: the
 * starter pack goes into the inventory. Runs inside the caller's user lock and
 * does nothing when the player already has an onboarding state.
 */
export async function startOnboarding(tx: Tx, userId: string): Promise<boolean> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { onboarding: true, inventory: true } });
  if (!user || user.onboarding !== null) return false;

  const pack = getPackById(STARTER_PACK_ID);
  const inventory = asArray<InventoryItem>(user.inventory);
  if (pack) {
    inventory.push({ packId: pack.id, packName: pack.name, acquiredAt: new Date().toISOString(), source: 'starter' });
  }
  const state: OnboardingState = { startedAt: new Date().toISOString(), claimed: [] };
  await tx.user.update({ where: { id: userId }, data: { inventory: asJson(inventory), onboarding: asJson(state) } });
  return true;
}

async function readProgress(userId: string, state: OnboardingState) {
  const [boosterCards, activeTeamCards, battles] = await Promise.all([
    prisma.userCard.count({ where: { userId, edition: { not: SIGNATURE_EDITION } } }),
    prisma.userCard.count({ where: { userId, inActiveTeam: true } }),
    prisma.battle.count({ where: { OR: [{ challengerId: userId }, { defenderId: userId }], status: 'COMPLETED' } }),
  ]);
  return { boosterCards, activeTeamCards, battles, collectionSeen: !!state.collectionSeen };
}

export interface OnboardingStatus extends OnboardingView {
  welcomeSeen: boolean;
}

/** The checklist for the player, or null when they are not onboarding (older player). */
export async function getOnboardingStatus(userId: string): Promise<OnboardingStatus | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { onboarding: true } });
  const state = parseOnboardingState(user?.onboarding);
  if (!state) return null;
  const view = buildOnboardingView(state, await readProgress(userId, state));
  return { ...view, welcomeSeen: !!state.welcomeSeen };
}

/** Changes the stored state under the user lock (no-op for players without onboarding). */
async function updateState(userId: string, change: (state: OnboardingState) => OnboardingState) {
  await withUserLock(userId, async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { onboarding: true } });
    const state = parseOnboardingState(user?.onboarding);
    if (!state) return;
    await tx.user.update({ where: { id: userId }, data: { onboarding: asJson(change(state)) } });
  });
}

export const markWelcomeSeen = (userId: string) => updateState(userId, s => ({ ...s, welcomeSeen: true }));
export const markCollectionSeen = (userId: string) => updateState(userId, s => ({ ...s, collectionSeen: true }));
export const dismissOnboarding = (userId: string) => updateState(userId, s => ({ ...s, dismissed: true }));
export const recordGuestCards = (userId: string, count: number) => updateState(userId, s => ({ ...s, guestCards: count }));

/** Pays a finished step once. Progress is read outside the lock (it only grows); the claim is atomic. */
export async function claimOnboardingStep(userId: string, stepId: OnboardingStepId): Promise<number> {
  const step = ONBOARDING_STEPS.find(s => s.id === stepId);
  if (!step) throw new UserFacingError('Unknown step');

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { onboarding: true } });
  const current = parseOnboardingState(user?.onboarding);
  if (!current) throw new UserFacingError('Onboarding is not active for this account', 404);
  if (!isStepDone(stepId, await readProgress(userId, current))) {
    throw new UserFacingError('Finish this step first');
  }

  return withUserLock(userId, async (tx) => {
    const fresh = await tx.user.findUnique({ where: { id: userId }, select: { onboarding: true } });
    const state = parseOnboardingState(fresh?.onboarding);
    if (!state) throw new UserFacingError('Onboarding is not active for this account', 404);
    if (state.claimed?.includes(stepId)) throw new UserFacingError('Reward already claimed', 409);
    const next: OnboardingState = { ...state, claimed: [...(state.claimed ?? []), stepId] };
    await tx.user.update({ where: { id: userId }, data: { onboarding: asJson(next) } });
    await addBits(userId, step.rewardBits, 'onboarding', { tx, detail: step.title });
    return step.rewardBits;
  });
}
