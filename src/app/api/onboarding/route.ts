import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { UserFacingError } from '@/lib/userLock';
import { ONBOARDING_STEPS, OnboardingStepId } from '@/lib/onboarding';
import {
  claimOnboardingStep,
  dismissOnboarding,
  getOnboardingStatus,
  markCollectionSeen,
  markWelcomeSeen,
} from '@/lib/onboardingService';

/** The "Getting started" checklist (null for players who aren't onboarding). */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ onboarding: await getOnboardingStatus(userId) });
}

/** { action: 'claim', step } · 'collection-seen' · 'welcome-seen' · 'dismiss' */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { action, step } = await req.json();
    switch (action) {
      case 'claim': {
        if (!ONBOARDING_STEPS.some(s => s.id === step)) {
          return NextResponse.json({ error: 'Unknown step' }, { status: 400 });
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
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
    return NextResponse.json({ success: true, onboarding: await getOnboardingStatus(userId) });
  } catch (error) {
    if (error instanceof UserFacingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Onboarding error:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
