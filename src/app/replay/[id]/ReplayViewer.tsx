'use client';

import { useState } from 'react';
import { Play } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import { BattleReplay } from '@/components/BattleReplay';
import { ShareButtons } from '@/components/ShareButtons';
import type { ReplayData } from '@/lib/battleReplay';

/** The "Watch the replay" button and the full-screen replay it opens. */
export function ReplayViewer({ replay, names, spectator, shareUrl, shareText }: {
  replay: ReplayData;
  names: { bottom: string; top: string };
  spectator: boolean;
  shareUrl: string;
  shareText: string;
}) {
  const t = useTranslations('public.replay');
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn-brand inline-flex items-center gap-2 px-8 py-3 text-lg font-black text-white"
      >
        <Play size={20} weight="fill" /> {t('watch')}
      </button>
      {open && (
        <BattleReplay
          {...replay}
          names={names}
          spectator={spectator}
          onReset={() => setOpen(false)}
          resetLabel={t('close')}
          shareSlot={<ShareButtons url={shareUrl} text={shareText} />}
        />
      )}
    </>
  );
}
