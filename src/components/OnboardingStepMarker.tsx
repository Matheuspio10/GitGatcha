'use client';

import { useEffect } from 'react';

/** Tells the server an onboarding step that has no game data behind it happened (e.g. the collection was seen). */
export function OnboardingStepMarker({ action }: { action: 'collection-seen' }) {
  useEffect(() => {
    fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
      .then(() => window.dispatchEvent(new Event('onboarding:refresh')))
      .catch(console.error);
  }, [action]);
  return null;
}
