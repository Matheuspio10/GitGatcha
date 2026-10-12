'use client';

import { useEffect } from 'react';
import { SessionProvider } from 'next-auth/react';
import { MotionConfig } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import { ensureAudioUnlock } from '@/lib/audioManager';

export function NextAuthProvider({ children }: { children: React.ReactNode }) {
  // Unlock the shared AudioContext on the first user gesture anywhere in the app
  useEffect(() => {
    ensureAudioUnlock();
  }, []);

  return (
    <SessionProvider>
      {/* Respect the OS "reduce motion" setting for every framer-motion animation */}
      <MotionConfig reducedMotion="user">
        {children}
        {/* Single global toaster: every page can call toast() */}
        <Toaster
          position="top-center"
          containerStyle={{ top: 72 }}
          toastOptions={{
            style: {
              background: '#0f172a',
              color: '#f8fafc',
              border: '1px solid #334155',
            },
          }}
        />
      </MotionConfig>
    </SessionProvider>
  );
}
