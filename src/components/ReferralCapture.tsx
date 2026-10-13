'use client';

import { useEffect } from 'react';
import { REFERRAL_COOKIE, normalizeReferralCode } from '@/lib/referral';

/**
 * Remembers an invite link's `?ref=<username>` for 30 days, so the referral
 * still counts when the visitor signs up later (or with Google / GitHub).
 */
export function ReferralCapture() {
  useEffect(() => {
    const code = normalizeReferralCode(new URLSearchParams(window.location.search).get('ref'));
    if (!code) return;
    document.cookie = `${REFERRAL_COOKIE}=${encodeURIComponent(code)}; Max-Age=${30 * 24 * 60 * 60}; Path=/; SameSite=Lax`;
  }, []);
  return null;
}
