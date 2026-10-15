'use client';

import { sizedAvatar } from '@/lib/avatarUrl';
import { useState, useEffect, useCallback } from 'react';
import { EmptyState } from '@/components/EmptyState';
import TeamBuilderUI, { TeamBuilderCard } from '@/components/TeamBuilderUI';
import { Sword, Lightning, Clock, Users, BookOpenText, Crown, Play } from '@phosphor-icons/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'react-hot-toast';
import type { AchievementUnlockNotice } from '@/lib/achievementToast';
import type { BattleRewards, LeagueMode } from '@/lib/battleConfig';
import { TowerPanel } from './TowerPanel';
import { ShareButtons, copyText } from '@/components/ShareButtons';
import { BattleReplay, type LiveBattleResult, type LoyaltyUnlock, type RankedResult } from '@/components/BattleReplay';
import { challengeLink } from '@/lib/challenges';
import { CHALLENGE_STAKE_MAX } from '@/lib/battleConfig';
import { isReplayLog, replayPath, swapSides, withMaxHp, type ReplayCardJson, type ReplayData, type ReplaySide, type ReplayStat, type ReplayTurn } from '@/lib/battleReplay';

/** What /api/battle and /api/tower answer after a battle. */
interface BattleApiResult {
  battleId?: string;
  log: ReplayTurn[];
  challengerTeam?: ReplayCardJson[];
  defenderTeam?: ReplayCardJson[];
  winnerSide: ReplaySide;
  rewards: BattleRewards;
  battleStats?: ReplayStat[];
  loyaltyUnlocks?: LoyaltyUnlock[];
  achievementsUnlocked?: AchievementUnlockNotice[];
  ranked?: RankedResult | null;
  tower?: unknown;
}

/** A finished battle from /api/battle/history (only the fields shown). */
interface HistoryBattle {
  id: string;
  challengerId: string;
  winnerId: string | null;
  isRandom: boolean;
  leagueMode: string | null;
  stake: number;
  completedAt: string;
  challenger: { username: string | null } | null;
  defender: { username: string | null } | null;
  challengerTeam: ReplayCardJson[] | null;
  defenderTeam: ReplayCardJson[] | null;
  log: unknown;
}

type Tab = 'Quick Battle' | 'Tower' | 'Challenge' | 'History';

/** Message key of each Arena tab (battle.tabs.*). */
const TAB_KEYS: Record<Tab, 'quick' | 'tower' | 'challenge' | 'history'> = {
  'Quick Battle': 'quick',
  Tower: 'tower',
  Challenge: 'challenge',
  History: 'history',
};

export default function BattleClient({ userCards, userId, powerCap, userBits }: { userCards: TeamBuilderCard[]; userId: string; powerCap: number; userBits: number }) {
  const t = useTranslations('battle');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const challengeParam = searchParams.get('challenge');
  // Coming from a challenge link (/challenge/<id>): answer it straight away
  const respondParam = searchParams.get('respond');
  const respondFrom = searchParams.get('from');

  const [tab, setTab] = useState<Tab>(challengeParam || respondParam ? 'Challenge' : 'Quick Battle');
  // Friend challenge options: BITS stake and a preset opponent for rematches
  const [stake, setStake] = useState(0);
  const [rematchWith, setRematchWith] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [leagueMode, setLeagueMode] = useState<LeagueMode>('OPEN');

  // Replay state
  const [replayData, setReplayData] = useState<(ReplayData & { live: LiveBattleResult; battleId?: string }) | null>(null);

  // Challenge state
  const [challenges, setChallenges] = useState<{
    incoming: { id: string; challenger: { id: string; username: string; image?: string }; createdAt: string; expiresAt: string; stake: number }[];
    outgoing: { id: string; defender: { id: string; username: string; image?: string } | null; stake: number; isOpen: boolean }[];
  }>({ incoming: [], outgoing: [] });
  const [respondingToId, setRespondingToId] = useState<string | null>(respondParam);
  const [respondingToChallenger, setRespondingToChallenger] = useState<string>(respondFrom ?? '');

  // History state
  const [history, setHistory] = useState<HistoryBattle[]>([]);

  const fetchChallenges = useCallback(async () => {
    try {
      const res = await fetch('/api/battle/challenge');
      const data = await res.json();
      setChallenges({ incoming: data.incoming || [], outgoing: data.outgoing || [] });
    } catch { /* silent */ }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/battle/history?limit=20');
      const data = await res.json();
      setHistory(data.battles || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (tab === 'Challenge') fetchChallenges();
    if (tab === 'History') fetchHistory();
  }, [tab, fetchChallenges, fetchHistory]);

  /** Turns a battle API response (league, Ranked or Tower) into the replay. */
  const showBattleResult = (data: BattleApiResult) => {
    // Use challenger team from API so IDs match the battle log
    setReplayData({
      battleId: data.battleId,
      log: data.log,
      challengerTeam: withMaxHp(data.challengerTeam),
      defenderTeam: withMaxHp(data.defenderTeam),
      winnerSide: data.winnerSide,
      battleStats: data.battleStats,
      live: {
        rewards: data.rewards,
        ranked: data.ranked ?? null,
        // Tower battles show no league label
        leagueMode: data.tower ? undefined : leagueMode,
        loyaltyUnlocks: data.loyaltyUnlocks,
        achievementsUnlocked: data.achievementsUnlocked,
      },
    });
  };

  const startRandomBattle = async (cardIds: string[]) => {
    if (cardIds.length !== 3) return;
    setLoading(true);
    setReplayData(null);
    try {
      const res = await fetch('/api/battle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardIds, leagueMode })
      });
      const data = await res.json();
      if (data.success) {
        showBattleResult(data);
      } else {
        toast.error(data.error || t('toasts.battleFailed'));
      }
    } catch {
      toast.error(t('toasts.battleFailed'));
    } finally {
      setLoading(false);
    }
  };

  const sendChallenge = async (cardIds: string[], defenderUsername: string) => {
    if (cardIds.length !== 3 || !defenderUsername) return;
    setLoading(true);
    try {
      const res = await fetch('/api/battle/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defenderUsername, cardIds, leagueMode, stake })
      });
      const data = await res.json();
      if (data.success) {
        fetchChallenges();
        window.dispatchEvent(new Event('bits:refresh'));
        setRematchWith(null);
        if (data.battle?.isOpen) {
          const link = challengeLink(window.location.origin, data.battle.id);
          await copyText(link, t('toasts.sharePrompt'));
          toast.success(t('toasts.linkCopiedShare'));
        } else {
          toast.success(t('toasts.sent'));
        }
      } else {
        toast.error(data.error || t('toasts.sendFailed'));
      }
    } catch {
      toast.error(t('toasts.sendFailed'));
    } finally {
      setLoading(false);
    }
  };

  const cancelChallenge = async (battleId: string) => {
    try {
      const res = await fetch(`/api/battle/challenge/${battleId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('toasts.cancelFailed'));
      toast.success(t('toasts.cancelled'));
      window.dispatchEvent(new Event('bits:refresh'));
      fetchChallenges();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const respondToChallenge = async (cardIds: string[]) => {
    if (!respondingToId || cardIds.length !== 3) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/battle/challenge/${respondingToId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardIds })
      });
      const data = await res.json();
      if (data.success) {
        // The API returns teams from the battle's perspective (challenger = who sent, defender = us):
        // the replay shows the battle from our chair, our team at the bottom
        const asDefender = swapSides({
          log: data.log || [],
          challengerTeam: withMaxHp(data.challengerTeam),
          defenderTeam: withMaxHp(data.defenderTeam),
          winnerSide: data.winnerSide,
          battleStats: data.battleStats,
        });
        setReplayData({
          ...asDefender,
          battleId: data.battleId,
          live: {
            rewards: data.defenderRewards,
            loyaltyUnlocks: data.loyaltyUnlocks,
            achievementsUnlocked: data.achievementsUnlocked,
          },
        });
        setRespondingToId(null);
        setRespondingToChallenger('');
        setTab('Quick Battle');
        fetchChallenges();
      } else {
        toast.error(data.error || t('toasts.respondFailed'));
      }
    } catch {
      toast.error(t('toasts.respondFailed'));
    } finally {
      setLoading(false);
    }
  };

  const resetBattle = () => {
    setReplayData(null);
  };

  if (replayData) {
    return (
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        <BattleReplay
          log={replayData.log}
          challengerTeam={replayData.challengerTeam}
          defenderTeam={replayData.defenderTeam}
          winnerSide={replayData.winnerSide}
          battleStats={replayData.battleStats}
          live={replayData.live}
          onReset={resetBattle}
          shareSlot={replayData.battleId && (
            <ShareButtons url={`${window.location.origin}${replayPath(replayData.battleId)}`} text={t('results.shareText')} />
          )}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 mb-2 tracking-tighter">
          {t('header.title')}
        </h1>
        <p className="text-slate-400 mb-2">{t('header.subtitle')}</p>
        <a href="/wiki#leagues-tournaments" className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium relative z-10">
          <BookOpenText size={16} weight="bold" /> {t('header.wiki')}
        </a>
      </div>

      {/* Tabs (wrap on phones) */}
      <div className="flex flex-wrap justify-center gap-2">
        {(['Quick Battle', 'Tower', 'Challenge', 'History'] as Tab[]).map(tabName => (
          <button
            key={tabName}
            onClick={() => { setTab(tabName); setRespondingToId(null); }}
            className={`px-4 sm:px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
              tab === tabName
                ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.3)]'
                : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            {tabName === 'Quick Battle' && <Lightning size={16} weight="fill" className="inline mr-1.5 -mt-0.5" />}
            {tabName === 'Tower' && <Crown size={16} weight="fill" className="inline mr-1.5 -mt-0.5" />}
            {tabName === 'Challenge' && <Users size={16} weight="fill" className="inline mr-1.5 -mt-0.5" />}
            {tabName === 'History' && <Clock size={16} weight="fill" className="inline mr-1.5 -mt-0.5" />}
            {t(`tabs.${TAB_KEYS[tabName]}`)}
            {tabName === 'Challenge' && challenges.incoming.length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {challenges.incoming.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── TOWER ── */}
      {tab === 'Tower' && (
        <TowerPanel userCards={userCards} powerCap={powerCap} userBits={userBits} onResult={showBattleResult} />
      )}

      {/* ── QUICK BATTLE ── */}
      {tab === 'Quick Battle' && (
        <TeamBuilderUI
          userCards={userCards}
          onSubmitRandom={startRandomBattle}
          onSubmitChallenge={sendChallenge}
          loading={loading}
          mode="quick"
          leagueMode={leagueMode}
          setLeagueMode={setLeagueMode}
          powerCap={powerCap}
          userBits={userBits}
        />
      )}

      {/* ── CHALLENGE TAB ── */}
      {tab === 'Challenge' && !respondingToId && (
        <div className="space-y-8">
          {/* Send new challenge via TeamBuilder */}
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
              <Sword size={20} className="text-red-400" />
              {rematchWith ? t('challenge.rematchVs', { name: rematchWith }) : t('challenge.create')}
            </h2>
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-sm">
              <label htmlFor="challenge-stake" className="font-bold text-slate-300">{t('challenge.stake')}</label>
              <input
                id="challenge-stake"
                type="number" min={0} max={CHALLENGE_STAKE_MAX} step={50}
                value={stake}
                onChange={e => setStake(Math.min(CHALLENGE_STAKE_MAX, Math.max(0, Math.floor(Number(e.target.value) || 0))))}
                className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-white"
              />
              <span className="text-xs text-slate-500">{t('challenge.stakeHelp', { max: CHALLENGE_STAKE_MAX })}</span>
              {rematchWith && (
                <button onClick={() => setRematchWith(null)} className="ml-auto text-xs text-slate-400 hover:text-white">{t('challenge.cancelRematch')}</button>
              )}
            </div>
            <TeamBuilderUI
              key={rematchWith ?? 'new-challenge'}
              challengeUsername={rematchWith ?? ''}
              challengeStake={stake}
              userCards={userCards}
              onSubmitRandom={startRandomBattle}
              onSubmitChallenge={sendChallenge}
              loading={loading}
              mode="challenge"
              leagueMode={leagueMode}
              setLeagueMode={setLeagueMode}
              powerCap={powerCap}
              userBits={userBits}
            />
          </div>

          {/* Incoming Challenges */}
          {challenges.incoming.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Lightning size={20} className="text-yellow-400" />
                {t('challenge.incoming')}
              </h2>
              {challenges.incoming.map(c => (
                <div key={c.id} className="bg-slate-900/60 border border-yellow-500/20 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-white">{t('challenge.challengesYou', { name: c.challenger?.username || t('challenge.unknown') })}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {t('challenge.expires', { date: new Date(c.expiresAt).toLocaleString(locale) })}
                      {c.stake > 0 && <span className="ml-2 font-bold text-yellow-300">Stake {c.stake} BITS</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setRespondingToId(c.id);
                      setRespondingToChallenger(c.challenger?.username || t('challenge.unknown'));
                    }}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-bold text-sm transition-colors"
                  >
                    {t('challenge.accept')}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Outgoing Challenges */}
          {challenges.outgoing.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Clock size={20} className="text-slate-400" />
                {t('challenge.sent')}
              </h2>
              {challenges.outgoing.map(c => (
                <div key={c.id} className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-white">{c.isOpen && !c.defender ? t('challenge.openLink') : t('challenge.vs', { name: c.defender?.username || t('challenge.unknown') })}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {t('challenge.awaiting')}
                      {c.stake > 0 && <span className="ml-2 font-bold text-yellow-300">Stake {c.stake} BITS</span>}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {c.isOpen && (
                      <button
                        onClick={async () => { await copyText(challengeLink(window.location.origin, c.id), t('toasts.sharePrompt')); toast.success(t('toasts.linkCopied')); }}
                        className="px-3 py-1.5 rounded-lg border border-slate-600 text-xs font-bold text-slate-200 hover:bg-slate-800"
                      >
                        {t('challenge.copyLink')}
                      </button>
                    )}
                    <button
                      onClick={() => cancelChallenge(c.id)}
                      className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-bold text-slate-400 hover:text-white hover:border-red-500/50"
                    >
                      {t('challenge.cancel')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {challenges.incoming.length === 0 && challenges.outgoing.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              <Users size={40} className="mx-auto mb-3 opacity-30" />
              <p>{t('challenge.none')}</p>
            </div>
          )}
        </div>
      )}

      {/* Respond to challenge */}
      {tab === 'Challenge' && respondingToId && (
        <div className="space-y-4">
          <button
            onClick={() => { setRespondingToId(null); setRespondingToChallenger(''); }}
            className="text-sm text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
          >
            {t('challenge.back')}
          </button>
          <TeamBuilderUI
            userCards={userCards}
            onSubmitRandom={startRandomBattle}
            onSubmitChallenge={sendChallenge}
            loading={loading}
            mode="respond"
            respondingToChallenger={respondingToChallenger}
            onRespond={respondToChallenge}
            leagueMode={leagueMode}
            setLeagueMode={setLeagueMode}
            powerCap={powerCap}
            userBits={userBits}
          />
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'History' && (
        <div className="max-w-3xl mx-auto space-y-4">
          {history.length === 0 ? (
            <EmptyState
              icon={<Clock size={40} />}
              title={t('history.emptyTitle')}
              text={t('history.emptyText')}
              actions={[{ label: t('history.start'), onClick: () => setTab('Quick Battle') }]}
            />
          ) : (
            history.map(battle => {
              const isChallenger = battle.challengerId === userId;
              const didWin = battle.winnerId === userId;
              const opponentName = isChallenger
                ? (battle.defender?.username || t('history.randomOpponent'))
                : (battle.challenger?.username || '???');

              const cTeam = withMaxHp(battle.challengerTeam);
              const dTeam = withMaxHp(battle.defenderTeam);

              return (
                <div key={battle.id} className={`bg-slate-900/60 border rounded-xl p-4 transition-all ${didWin ? 'border-green-500/20' : 'border-red-500/20'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${didWin ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="font-bold text-white">{t(didWin ? 'history.victoryVs' : 'history.defeatVs', { name: opponentName })}</span>
                      {battle.isRandom && (
                        <span className="text-[10px] uppercase bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">{t('history.random')}</span>
                      )}
                      {battle.stake > 0 && (
                        <span className="text-[10px] uppercase bg-yellow-500/10 text-yellow-300 px-2 py-0.5 rounded-full">{t('history.stake', { amount: battle.stake })}</span>
                      )}
                      {!battle.isRandom && battle.leagueMode !== 'RANKED' && opponentName && opponentName !== '???' && (
                        <button
                          onClick={() => { setRematchWith(opponentName); setStake(battle.stake || 0); setRespondingToId(null); setTab('Challenge'); }}
                          className="text-[10px] uppercase font-bold bg-orange-500/10 text-orange-300 px-2 py-0.5 rounded-full hover:bg-orange-500/20"
                        >
                          {t('history.rematch')}
                        </button>
                      )}
                      {isReplayLog(battle.log) && (
                        <Link
                          href={replayPath(battle.id)}
                          className="inline-flex items-center gap-1 text-[10px] uppercase font-bold bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded-full hover:bg-indigo-500/20"
                        >
                          <Play size={10} weight="fill" /> {t('history.watch')}
                        </Link>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">
                      {new Date(battle.completedAt).toLocaleDateString(locale)}
                    </span>
                  </div>

                  {(cTeam.length > 0 || dTeam.length > 0) && (
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                      {cTeam.length > 0 && (
                        <div>
                          <p className="text-blue-400 mb-1 uppercase tracking-wide text-[10px]">{t('history.challenger')}</p>
                          <div className="flex gap-1">
                            {cTeam.map(c => (
                              <div key={c.id} className="flex items-center gap-1 bg-slate-800 rounded px-1.5 py-0.5">
                                {c.avatarUrl && <img src={sizedAvatar(c.avatarUrl, 16)} className="w-4 h-4 rounded-full object-cover" alt="" />}
                                <span>{c.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {dTeam.length > 0 && (
                        <div>
                          <p className="text-red-400 mb-1 uppercase tracking-wide text-[10px]">{t('history.defender')}</p>
                          <div className="flex gap-1">
                            {dTeam.map(c => (
                              <div key={c.id} className="flex items-center gap-1 bg-slate-800 rounded px-1.5 py-0.5">
                                {c.avatarUrl && <img src={sizedAvatar(c.avatarUrl, 16)} className="w-4 h-4 rounded-full object-cover" alt="" />}
                                <span>{c.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
