'use client';

import { sizedAvatar } from '@/lib/avatarUrl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { CheckCircle, Crown, Lock, Skull, Trophy } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import TeamBuilderUI, { type TeamBuilderCard } from '@/components/TeamBuilderUI';
import { formatSeasonLeft } from '@/lib/seasons';
import { TOWER_FLOORS } from '@/lib/tower';
import { useGameText } from '@/i18n/gameText';

interface TowerState {
  name: string;
  theme: string;
  resetsAt: string;
  cleared: number;
  attempts: number;
  floors: { floor: number; title: string; rewardBits: number; boss?: 'mini' | 'final'; rarities: string[] }[];
  next: null | { floor: number; title: string; rewardBits: number; boss?: 'mini' | 'final'; opponents: { name: string; rarity: string; primaryLanguage: string | null; avatarUrl: string | null }[] };
  ranking: { username: string | null; cleared: number; attempts: number; isYou: boolean }[];
}

const RARITY_TEXT: Record<string, string> = {
  Common: 'text-slate-300', Uncommon: 'text-green-400', Rare: 'text-blue-400', Epic: 'text-purple-400', Legendary: 'text-yellow-400',
};

/**
 * The Tower tab of the Arena: this week's floors, the next opponents (visible,
 * so you can build a counter), the team builder and the weekly ranking.
 */
export function TowerPanel({ userCards, powerCap, userBits, onResult }: {
  userCards: TeamBuilderCard[];
  powerCap: number;
  userBits: number;
  /** Hands the battle (the /api/tower JSON answer) to the Arena's replay. */
  onResult: (data: Awaited<ReturnType<Response['json']>>) => void;
}) {
  const t = useTranslations('battle.tower');
  const battleText = useGameText('gameBattle');
  const [state, setState] = useState<TowerState | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    fetch('/api/tower', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => (data.error ? toast.error(data.error) : setState(data)))
      .catch(console.error);
  }, []);

  useEffect(() => { load(); }, [load]);

  const fight = async (cardIds: string[]) => {
    setLoading(true);
    try {
      const res = await fetch('/api/tower', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardIds }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('failed'));
      if (data.tower?.cleared) {
        const floor: number = data.tower.floor;
        const title = floorText({ floor, boss: TOWER_FLOORS[floor - 1]?.boss, title: data.tower.title });
        toast.success(t('cleared', { title, bits: data.rewards.bits }));
      }
      window.dispatchEvent(new Event('bits:refresh'));
      onResult(data);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  /** Tower and floor names are rebuilt from the theme and the floor (the server sends English). */
  function floorText(f: { floor: number; boss?: 'mini' | 'final'; title: string }) {
    return battleText(`tower.floorTitle.${f.boss ?? 'regular'}`, f.title, { floor: f.floor, theme: state?.theme ?? '' });
  }

  if (!state) return <div className="h-64 animate-pulse rounded-2xl bg-slate-900/60" aria-label={t('loading')} />;

  const towerName = battleText('tower.name', state.name, { theme: state.theme });
  const nextTitle = state.next ? floorText(state.next) : '';
  const resetsIn = formatSeasonLeft(new Date(state.resetsAt).getTime() - Date.now());

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-transparent p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-orange-300">{t('thisWeek', { time: resetsIn })}</p>
        <h2 className="font-display text-2xl font-extrabold text-white">{towerName}</h2>
        <p className="text-sm text-slate-400">
          {t('progress', { cleared: state.cleared, total: state.floors.length, attempts: state.attempts })}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          {state.next ? (
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 font-bold text-white">
                  {state.next.boss ? <Skull size={18} className="text-red-400" /> : <Crown size={18} className="text-orange-300" />}
                  {nextTitle}
                </h3>
                <span className="text-sm font-bold text-yellow-300">+{state.next.rewardBits} BITS</span>
              </div>
              <ul className="mt-3 grid gap-2 sm:grid-cols-3">
                {state.next.opponents.map(o => (
                  <li key={o.name} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {o.avatarUrl && <img src={sizedAvatar(o.avatarUrl, 32)} alt="" width={32} height={32} className="rounded-lg" />}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-white">{o.name}</span>
                      <span className={`block text-xs ${RARITY_TEXT[o.rarity] ?? 'text-slate-400'}`}>{o.rarity}{o.primaryLanguage ? ` · ${o.primaryLanguage}` : ''}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-6 text-center">
              <Trophy size={40} weight="fill" className="mx-auto text-yellow-400" />
              <p className="mt-2 font-bold text-white">{t('conquered', { name: towerName })}</p>
              <p className="text-sm text-slate-300">{t('newTowerIn', { time: resetsIn })}</p>
            </div>
          )}

          {state.next && (
            <TeamBuilderUI
              userCards={userCards}
              onSubmitRandom={fight}
              onSubmitChallenge={() => {}}
              loading={loading}
              mode="quick"
              powerCap={powerCap}
              userBits={userBits}
              quickAction={{
                label: t('fightFloor', { floor: state.next.floor }),
                title: t('confirmTitle', { title: nextTitle }),
                description: t('confirmText', { floor: state.next.floor, name: towerName }),
              }}
            />
          )}
        </div>

        <aside className="space-y-6">
          <ol className="space-y-1.5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            {[...state.floors].reverse().map(f => {
              const done = f.floor <= state.cleared;
              const current = f.floor === state.cleared + 1;
              return (
                <li key={f.floor} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${current ? 'bg-orange-500/15 text-white' : done ? 'text-slate-400' : 'text-slate-500'}`}>
                  {done ? <CheckCircle size={16} weight="fill" className="text-emerald-400" /> : current ? <Crown size={16} className="text-orange-300" /> : <Lock size={16} />}
                  <span className="flex-1">{t(f.boss === 'final' ? 'floorBoss' : f.boss === 'mini' ? 'floorMiniBoss' : 'floor', { floor: f.floor })}</span>
                  <span className="font-mono text-xs text-yellow-300/80">+{f.rewardBits}</span>
                </li>
              );
            })}
          </ol>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{t('ranking')}</h3>
            {state.ranking.length === 0 ? (
              <p className="text-sm text-slate-500">{t('rankingEmpty')}</p>
            ) : (
              <ol className="space-y-1 text-sm">
                {state.ranking.map((r, i) => (
                  <li key={`${r.username}-${i}`} className={`flex items-center gap-2 ${r.isYou ? 'text-orange-300 font-bold' : 'text-slate-300'}`}>
                    <span className="w-5 font-mono text-slate-500">{i + 1}</span>
                    <span className="flex-1 truncate">{r.username ?? t('player')}</span>
                    <span className="font-mono">{t('floorShort', { floor: r.cleared })}</span>
                    <span className="font-mono text-xs text-slate-500">{r.attempts}×</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
