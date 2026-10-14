'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Lock, Check, IdentificationBadge } from '@phosphor-icons/react';
import type { PublicFrame, PublicTitle } from '@/lib/collections';
import { useTranslations } from 'next-intl';
import { useGameText } from '@/i18n/gameText';
import { frameText, titleText } from '@/components/PlayerCosmetics';

type Option<T> = T & { requirement: string; unlocked: boolean };
interface CosmeticsState {
  titles: Option<PublicTitle>[];
  frames: Option<PublicFrame>[];
  equipped: { title: PublicTitle | null; frame: PublicFrame | null };
}

/**
 * Own profile: pick the title and avatar frame to show. Locked ones are listed
 * with what unlocks them (levels and completed language sets).
 */
export function CosmeticsPicker({ onChange }: { onChange: (equipped: CosmeticsState['equipped']) => void }) {
  const [state, setState] = useState<CosmeticsState | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLocked, setShowLocked] = useState(false);
  const tr = useTranslations('collection.cosmetics');
  const achText = useGameText('gameAchievements');

  useEffect(() => {
    fetch('/api/profile/cosmetics')
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data) setState(data); })
      .catch(console.error);
  }, []);

  if (!state) return null;

  const equip = async (patch: { title?: string | null; frame?: string | null }) => {
    setBusy(true);
    try {
      const res = await fetch('/api/profile/cosmetics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || tr('updateFailed'));
        return;
      }
      setState(prev => (prev ? { ...prev, equipped: data.equipped } : prev));
      onChange(data.equipped);
    } catch {
      toast.error(tr('updateFailed'));
    } finally {
      setBusy(false);
    }
  };

  // Per-language "Collector" titles only show once unlocked (or with "show locked"), so the list stays short
  const titles = state.titles.filter(t => t.unlocked || showLocked || !t.id.startsWith('set-'));
  const chip = (active: boolean, unlocked: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
      active ? 'border-indigo-400 bg-indigo-500/20 text-white'
        : unlocked ? 'border-slate-700 bg-slate-800/60 text-slate-200 hover:border-slate-500'
        : 'border-slate-800 bg-slate-900/40 text-slate-500 cursor-not-allowed'
    }`;

  return (
    <div className="bg-slate-900/60 backdrop-blur-sm p-6 rounded-[2rem] border border-white/5 shadow-xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-bold text-white">
          <IdentificationBadge size={20} weight="fill" className="text-indigo-400" /> {tr('heading')}
        </h3>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={showLocked} onChange={e => setShowLocked(e.target.checked)} /> {tr('showAll')}
        </label>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">{tr('title')}</p>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => equip({ title: null })} className={chip(!state.equipped.title, true)}>{tr('none')}</button>
          {titles.map(t => (
            <button
              key={t.id}
              disabled={busy || !t.unlocked}
              onClick={() => equip({ title: t.id })}
              title={t.unlocked ? titleText(achText, t) : tr('locked', { requirement: titleText(achText, t, 'requirement') })}
              className={chip(state.equipped.title?.id === t.id, t.unlocked)}
            >
              {t.unlocked ? (state.equipped.title?.id === t.id && <Check size={12} weight="bold" />) : <Lock size={12} />}
              <span className={t.unlocked ? t.color : ''}>{titleText(achText, t)}</span>
              {!t.unlocked && <span className="font-normal">· {titleText(achText, t, 'requirement')}</span>}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">{tr('frame')}</p>
        <div className="flex flex-wrap gap-3">
          <button disabled={busy} onClick={() => equip({ frame: null })} className={chip(!state.equipped.frame, true)}>{tr('none')}</button>
          {state.frames.map(f => (
            <button
              key={f.id}
              disabled={busy || !f.unlocked}
              onClick={() => equip({ frame: f.id })}
              title={f.unlocked ? tr('frameLabel', { label: frameText(achText, f) }) : tr('locked', { requirement: frameText(achText, f, 'requirement') })}
              className={chip(state.equipped.frame?.id === f.id, f.unlocked)}
            >
              <span className={`h-4 w-4 rounded-full ${f.unlocked ? '' : 'opacity-30'}`} style={{ background: f.ring }} />
              {frameText(achText, f)}
              {!f.unlocked && <span className="font-normal">· {frameText(achText, f, 'requirement')}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
