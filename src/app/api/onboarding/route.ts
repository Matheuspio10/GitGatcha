import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ONBOARDING_STEPS, OnboardingStepId } from '@/lib/onboarding';
import { apiError, readBody, routeError } from '@/lib/apiResponse';
import { z } from 'zod';
import {
  claimOnboardingStep,
  dismissOnboarding,
  getOnboardingStatus,
  markCollectionSeen,
  markWelcomeSeen,
} from '@/lib/onboardingService';

const ACTIONS = ['claim', 'collection-seen', 'welcome-seen', 'dismiss'] as const;

const bodySchema = z.object({
  action: z.enum(ACTIONS, { error: 'onboarding.unknownAction' }),
  step: z.string({ error: 'onboarding.unknownStep' }).max(100, { error: 'onboarding.unknownStep' }).optional(),
}, { error: 'onboarding.unknownAction' });

/** The "Getting started" checklist (null for players who aren't onboarding). */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  return NextResponse.json({ onboarding: await getOnboardingStatus(userId) });
}

/** { action: 'claim', step } · 'collection-seen' · 'welcome-seen' · 'dismiss' */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return apiError('common.unauthorized', 401);

    const body = await readBody(req, bodySchema);
    if (!body.ok) return body.response;
    const { action, step } = body.data;
    switch (action) {
      case 'claim': {
        if (!ONBOARDING_STEPS.some(s => s.id === step)) {
          return apiError('onboarding.unknownStep');
        }
        const bits = await claimOnboardingStep(userId, step as OnboardingStepId);
        return NextResponse.json({ success: true, bits, onboarding: await getOnboardingStatus(userId) });
      }
      case 'collection-seen':
        await markCollectionSeen(userId);
        break;
      case 'welcome-seen':
        await markWelcomeSeen(userId);
        break;
      case 'dismiss':
        await dismissOnboarding(userId);
        break;
    }
    return NextResponse.json({ success: true, onboarding: await getOnboardingStatus(userId) });
  } catch (error) {
    return routeError(error, 'onboarding.failed', 'Onboarding error');
  }
}
