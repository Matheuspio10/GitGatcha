import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { PublicFrame, PublicTitle } from '@/lib/collections';
import { useGameText, type GameText } from '@/i18n/gameText';

/**
 * Translated title text (gameAchievements `titles.*`), by id. Per-language
 * "set-<Language>" titles share `titles.languageSet.*` with {language}.
 * The English from src/lib (label / requirement) is the fallback.
 */
export function titleText(
  achText: GameText,
  title: { id: string; label: string; requirement?: string },
  field: 'label' | 'requirement' = 'label',
): string {
  const fallback = field === 'label' ? title.label : title.requirement ?? '';
  return title.id.startsWith('set-')
    ? achText(`titles.languageSet.${field}`, fallback, { language: title.id.slice('set-'.length) })
    : achText(`titles.${title.id}.${field}`, fallback);
}

/** Translated frame text (gameAchievements `frames.<id>.*`), English from src/lib as the fallback. */
export function frameText(
  achText: GameText,
  frame: { id: string; label: string; requirement?: string },
  field: 'label' | 'requirement' = 'label',
): string {
  return achText(`frames.${frame.id}.${field}`, field === 'label' ? frame.label : frame.requirement ?? '');
}

/** Ring around a player's avatar when they equipped a frame (collections.ts). */
export function AvatarFrame({ frame, children, className = '', thickness = 4 }: {
  frame: PublicFrame | null | undefined;
  children: ReactNode;
  className?: string;
  /** Ring width in px (wider where the avatar already has its own ring). */
  thickness?: number;
}) {
  const t = useTranslations('common');
  const achText = useGameText('gameAchievements');
  if (!frame) return <>{children}</>;
  return (
    <span className={`relative inline-flex rounded-full ${className}`} style={{ padding: thickness }} title={t('frame', { label: frameText(achText, frame) })}>
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
  const achText = useGameText('gameAchievements');
  if (!title) return null;
  return <span className={`text-xs font-bold uppercase tracking-wider ${title.color} ${className}`}>{titleText(achText, title)}</span>;
}
