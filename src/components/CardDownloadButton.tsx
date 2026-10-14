'use client';

import { DownloadSimple } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';

/** URL of a card rendered as a PNG (400×560); the Signature edition only renders for its holder. */
export function cardImagePath(login: string, signature = false): string {
  return `/api/card-image/${encodeURIComponent(login)}${signature ? '?edition=signature' : ''}`;
}

/** Saves the card as a PNG file (same origin, so the browser honours `download`). */
export function CardDownloadButton({ login, signature = false, className, label }: {
  login: string;
  signature?: boolean;
  className?: string;
  label?: string;
}) {
  const t = useTranslations('collection.download');
  return (
    <a
      href={cardImagePath(login, signature)}
      download={`${login}-${signature ? 'signature' : 'card'}-gitgacha.png`}
      className={className}
      title={t('title')}
    >
      <DownloadSimple size={16} weight="bold" />
      {label ?? t('label')}
    </a>
  );
}
