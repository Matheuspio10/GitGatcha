import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { PublicFrame, PublicTitle } from '@/lib/collections';

/** Ring around a player's avatar when they equipped a frame (collections.ts). */
export function AvatarFrame({ frame, children, className = '', thickness = 4 }: {
  frame: PublicFrame | null | undefined;
  children: ReactNode;
  className?: string;
  /** Ring width in px (wider where the avatar already has its own ring). */
  thickness?: number;
}) {
  const t = useTranslations('common');
  if (!frame) return <>{children}</>;
  return (
    <span className={`relative inline-flex rounded-full ${className}`} style={{ padding: thickness }} title={t('frame', { label: frame.label })}>
      <span
        aria-hidden
        className={`absolute inset-0 rounded-full ${frame.animated ? 'animate-[spin_6s_linear_infinite]' : ''}`}
        style={{ background: frame.ring }}
      />
      <span className="relative rounded-full">{children}</span>
    </span>
  );
}

/** A player's equipped title, as a small label. */
export function PlayerTitle({ title, className = '' }: { title: PublicTitle | null | undefined; className?: string }) {
  if (!title) return null;
  return <span className={`text-xs font-bold uppercase tracking-wider ${title.color} ${className}`}>{title.label}</span>;
}
