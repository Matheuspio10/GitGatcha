'use client';

import { SessionProvider } from 'next-auth/react';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { GlobalAudio } from '@/lib/audioManager';

function GlobalAudioListener() {
  const pathname = usePathname();

  useEffect(() => {
    // Only play whoosh if initialized (prevents initial load whoosh before interaction)
    if (GlobalAudio.Settings) {
        GlobalAudio.play('general/nav_whoosh');
    }
  }, [pathname]);

  useEffect(() => {
    const handlePointerDown = () => {
       GlobalAudio.init(); // Must be on user interaction
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't play if click is on something we handle explicitly like Pack Selection, or if it's not a button
      const clickable = target.closest('button, a, [role="button"]');
      
      if (clickable) {
         // Determine if primary or secondary arbitrarily by class/text
         const text = clickable.textContent?.toLowerCase() || '';
         const className = clickable.className?.toLowerCase() || '';
         const isSecondary = text.includes('cancel') || text.includes('close') || text.includes('back') || className.includes('secondary');
         
         GlobalAudio.play(isSecondary ? 'general/button_click_secondary' : 'general/button_click_primary', true);
      }
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Only for fine pointers (desktop)
      const clickable = target.closest('button, a, [role="button"]');
      if (clickable && window.matchMedia('(pointer: fine)').matches) {
         GlobalAudio.play('general/hover_tick', true);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('click', handleClick, { capture: true, passive: true });
    document.addEventListener('mouseover', handleMouseOver, { passive: true });

    return () => {
       document.removeEventListener('pointerdown', handlePointerDown);
       document.removeEventListener('click', handleClick, { capture: true });
       document.removeEventListener('mouseover', handleMouseOver);
    };
  }, []);

  return null;
}

export function NextAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <GlobalAudioListener />
      {children}
    </SessionProvider>
  );
}
