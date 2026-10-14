'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Barbell, Coin } from '@phosphor-icons/react';
import { WILDCARD, needsWildcards, planFragmentPayment } from '@/lib/fragments';
import { TRAINING_BONUS_PER_LEVEL, maxTrainingLevel, trainedStats, trainingCost } from '@/lib/training';
import { useTranslations } from 'next-intl';

type Wallet = { fragments: Record<string, number>; currency: number };

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Training of one of the player's cards: level, battle bonus, the next level's
 * price (BITS + fragments of the card's language) and the button to pay it.
 */
export function TrainingPanel({ card, onTrained }: {
  card: { userCardId?: string; name: string; rarity: string; primaryLanguage?: string | null; atk: number; def: number; hp: number; trainingLevel?: number };
  onTrained: (trainingLevel: number) => void;
}) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [busy, setBusy] = useState(false);
  const t = useTranslations('collection.training');

  useEffect(() => {
    fetch('/api/forge/wallet')
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data) setWallet({ fragments: data.fragments || {}, currency: data.currency || 0 }); })
      .catch(console.error);
  }, []);

  const level = card.trainingLevel ?? 0;
  const max = maxTrainingLevel(card.rarity);
  const cost = trainingCost(level, card.rarity);
  const lang = card.primaryLanguage || 'Unknown';
  const fragmentLabel = needsWildcards(lang) ? t('wildcardFragments') : t('fragments', { language: lang });
  const payment = cost && wallet ? planFragmentPayment(wallet.fragments, lang, cost.fragments) : null;
  const ownedFragments = wallet ? (needsWildcards(lang) ? 0 : wallet.fragments[lang] || 0) + (wallet.fragments[WILDCARD] || 0) : 0;
  const canTrain = !!cost && !!wallet && !!payment && wallet.currency >= cost.bits;
  const now = trainedStats(card, level);
  const next = cost ? trainedStats(card, level + 1) : null;

  const train = async () => {
    if (!card.userCardId || !canTrain) return;
    setBusy(true);
    try {
      const res = await fetch('/api/collection/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userCardId: card.userCardId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t('failed'));
        return;
      }
      setWallet({ fragments: data.fragments, currency: data.currency });
      onTrained(data.trainingLevel);
      window.dispatchEvent(new Event('bits:refresh'));
      toast.success(t('success', { name: card.name, level: data.trainingLevel }));
    } catch {
      toast.error(t('failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Barbell size={16} weight="fill" className="text-sky-400" />
          {t('title')}
        </h3>
        <span className="text-xs font-mono text-slate-400">
          {t.rich('level', { level, max, b: chunks => <span className="font-black text-white">{chunks}</span> })}
          {level > 0 && <span className="ml-2 text-sky-300">{t('bonus', { percent: pct(level * TRAINING_BONUS_PER_LEVEL) })}</span>}
        </span>
      </div>

      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < level ? 'bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.6)]' : 'bg-slate-800'}`} />
        ))}
      </div>

      {cost && next ? (
        <>
          <p className="text-xs text-slate-400">
            {t.rich('nextLevel', {
              atk: now.atk, nextAtk: next.atk, def: now.def, nextDef: next.def, hp: now.hp, nextHp: next.hp,
              b: chunks => <span className="text-white font-bold">{chunks}</span>,
            })}
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
              <p className="text-slate-500">{fragmentLabel}</p>
              <p className={`font-black ${payment ? 'text-emerald-400' : 'text-red-400'}`}>{Math.min(ownedFragments, cost.fragments)} / {cost.fragments}</p>
              {payment && payment.fromWildcard > 0 && !needsWildcards(lang) && <p className="text-[10px] text-amber-300">{t('usesWildcard', { count: payment.fromWildcard })}</p>}
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
              <p className="text-slate-500 flex items-center gap-1"><Coin size={12} weight="fill" className="text-yellow-500" /> BITS</p>
              <p className={`font-black ${wallet && wallet.currency >= cost.bits ? 'text-emerald-400' : 'text-red-400'}`}>{wallet ? Math.min(wallet.currency, cost.bits) : '…'} / {cost.bits}</p>
            </div>
          </div>
          <button
            onClick={train}
            disabled={!canTrain || busy}
            className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all ${canTrain ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-[0_0_15px_rgba(14,165,233,0.3)]' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
          >
            {busy ? t('training') : canTrain ? t('trainTo', { level: level + 1 }) : t('notEnough')}
          </button>
          <p className="text-[10px] text-slate-500">{t('hint')}</p>
        </>
      ) : (
        <p className="text-xs text-sky-300">{t('maxed', { percent: pct(max * TRAINING_BONUS_PER_LEVEL) })}</p>
      )}
    </div>
  );
}
