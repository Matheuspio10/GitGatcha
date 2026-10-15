'use client';

import { sizedAvatar } from '@/lib/avatarUrl';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import clsx from 'clsx';
import {
  Sword, Lightning, Trophy, Clock,
  ArrowClockwise, ArrowCounterClockwise, X, Skull, Sparkle, ArrowRight, Star, ChartBar, BookOpenText } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import { useBattleAudio } from '@/app/battle/useBattleAudio';
import { useNotifyAchievements, AchievementUnlockNotice } from '@/lib/achievementToast';
import type { BattleRewards, LeagueMode } from '@/lib/battleConfig';
import { RankBadge } from '@/components/RankBadge';
import { LEAGUES } from '@/lib/battleConfig';
import { useGameText } from '@/i18n/gameText';
import type { ReplayCard as TeamCard, ReplayStat as BattleStat, ReplayTurn as TurnLog, ReplaySide } from '@/lib/battleReplay';

function FloatingDamage({ value, side, isCrit }: { value: number; side: 'top' | 'bottom'; isCrit?: boolean }) {
  const t = useTranslations('battle.replay');
  const fontSize = Math.min(48, 20 + Math.floor(value / 100) * 6);
  // Random horizontal offset between -30px and 30px, plus a drift; drawn once per number
  const [{ randomX, drift }] = useState(() => ({
    randomX: Math.floor(Math.random() * 60) - 30,
    drift: Math.random() * 40 - 20,
  }));
  return (
    <motion.div
      initial={{ opacity: 1, y: 0, x: randomX, scale: 0.5 }}
      animate={{ opacity: 0, y: side === 'top' ? 80 : -80, x: randomX + drift, scale: 1.5 }}
      transition={{ duration: 1.0, ease: 'easeOut' }}
      className={clsx(
        'absolute z-40 font-black pointer-events-none drop-shadow-lg',
        side === 'top' ? 'top-10 left-1/2 -ml-8' : 'bottom-10 left-1/2 -ml-8',
        isCrit ? 'text-yellow-300' : 'text-red-500'
      )}
      style={{ fontSize }}
    >
      {isCrit && <div className="text-[10px] uppercase text-yellow-200 text-center -mb-2 tracking-widest bg-black/50 px-2 rounded-full w-fit mx-auto border border-yellow-500/50">{t('crit')}</div>}
      -{value}
    </motion.div>
  );
}

function CombatProjectile({ from, language }: { from: 'top' | 'bottom'; language?: string | null }) {
  const colors: Record<string, string> = {
    Python: 'from-green-400 to-green-600',
    JavaScript: 'from-yellow-400 to-orange-500',
    TypeScript: 'from-blue-400 to-blue-600',
    Rust: 'from-orange-600 to-red-800',
    Go: 'from-cyan-400 to-teal-500',
    Java: 'from-red-500 to-orange-600',
    'C++': 'from-blue-600 to-indigo-800',
    'C#': 'from-purple-500 to-purple-700',
    Ruby: 'from-red-600 to-rose-800',
    PHP: 'from-indigo-400 to-purple-600',
  };
  
  const bg = language && colors[language] ? colors[language] : 'from-slate-300 to-slate-500';

  return (
    <motion.div
      initial={{ top: from === 'top' ? '10%' : '90%', opacity: 1, scale: 0.5 }}
      animate={{ top: from === 'top' ? '90%' : '10%', opacity: 0, scale: 1.5 }}
      transition={{ duration: 0.3, ease: 'linear' }}
      className={`absolute left-1/2 -ml-2 w-4 h-16 rounded-full bg-gradient-to-b ${bg} shadow-[0_0_15px_currentColor] z-30 opacity-80 blur-[1px]`}
      style={{ transform: from === 'bottom' ? 'rotate(180deg)' : 'none' }}
    />
  );
}

function PassiveBanner({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scaleY: 0 }}
      animate={{ opacity: 1, scaleY: 1 }}
      exit={{ opacity: 0, scaleY: 0 }}
      transition={{ duration: 0.2 }}
      className="absolute top-1/2 left-0 right-0 -mt-8 h-16 bg-gradient-to-r from-transparent via-purple-900/90 to-transparent z-50 flex items-center justify-center border-y border-purple-500/50 backdrop-blur-sm"
    >
      <div className="flex items-center gap-3">
        <Sparkle weight="fill" className="text-purple-400 animate-pulse" size={24} />
        <span className="text-xl font-black text-white tracking-wider glow-text-purple uppercase">{message}</span>
        <Sparkle weight="fill" className="text-purple-400 animate-pulse" size={24} />
      </div>
    </motion.div>
  );
}

const SHARD_COLORS: Record<string, string> = {
  Common: '#94a3b8', Uncommon: '#4ade80', Rare: '#60a5fa', Epic: '#c084fc', Legendary: '#facc15',
};

/** The KO: shards of the card fly outward and fade. Directions are fixed, so every replay looks the same. */
function KoBurst({ rarity }: { rarity: string }) {
  const color = SHARD_COLORS[rarity] ?? SHARD_COLORS.Common;
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
      {Array.from({ length: 10 }, (_, i) => {
        const angle = (i / 10) * Math.PI * 2;
        const dist = 90 + (i % 3) * 25;
        return (
          <motion.span
            key={i}
            className="absolute h-3 w-2 rounded-[2px]"
            style={{ backgroundColor: color }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
            animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, opacity: 0, rotate: 180 + i * 40, scale: 0.4 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}

// Active Card on battlefield — self-contained with all stats inside
function BattleFieldCard({ card, hp, maxHp, side, defeated, onFire, isAttacking, isDefending }: {
  card: TeamCard; hp: number; maxHp: number; side: 'top' | 'bottom'; defeated?: boolean; onFire?: number;
  isAttacking?: boolean; isDefending?: boolean;
}) {
  const hpPct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const hpColor = hpPct > 50 ? 'from-emerald-500 to-green-400' : hpPct > 25 ? 'from-yellow-500 to-amber-400' : 'from-red-600 to-red-400';
  const isTop = side === 'top';
  const lowHp = hp > 0 && hp < maxHp * 0.25;
  const reduceMotion = useReducedMotion();

  const rarityBorder: Record<string, string> = {
    Common: 'border-slate-600',
    Uncommon: 'border-green-500/60 shadow-[0_0_12px_rgba(34,197,94,0.2)]',
    Rare: 'border-blue-500/60 shadow-[0_0_15px_rgba(59,130,246,0.3)]',
    Epic: 'border-purple-500/60 shadow-[0_0_20px_rgba(168,85,247,0.4)]',
    Legendary: 'border-yellow-400/80 shadow-[0_0_30px_rgba(250,204,21,0.5)]',
  };

  return (
    <motion.div layout className="relative">
    <motion.div
      initial={{ opacity: 0, y: isTop ? -60 : 60, scale: 0.9 }}
      animate={{
        // KO: the card drains, sinks and blurs out while its shards fly off (KoBurst)
        opacity: defeated ? 0.15 : 1,
        y: defeated ? (isTop ? -10 : 10) : isAttacking ? (isTop ? 24 : -24) : 0,
        x: isDefending && !reduceMotion ? [0, -6, 6, -6, 6, 0] : 0,
        scale: defeated ? 0.8 : 1,
        // Impact: the hit card flashes white for a beat
        filter: defeated
          ? 'grayscale(100%) blur(2px) brightness(1)'
          : isDefending ? ['grayscale(0%) blur(0px) brightness(1)', 'grayscale(0%) blur(0px) brightness(2.2)', 'grayscale(0%) blur(0px) brightness(1)'] : 'grayscale(0%) blur(0px) brightness(1)',
      }}
      exit={{ opacity: 0, scale: 0.5, rotateY: 90 }}
      transition={{
        type: 'spring', stiffness: 200, damping: 20,
        x: { duration: 0.3 },
        filter: { duration: defeated ? 0.9 : 0.25 },
        opacity: { duration: defeated ? 0.9 : 0.3 },
      }}
      className="relative"
    >
      {/* On Fire/Momentum badge */}
      {onFire && onFire > 0 && !defeated && (
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 1 }}
          className="absolute -top-3 -right-3 z-30 bg-gradient-to-br from-orange-400 to-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg border border-orange-300"
        >
          🔥 +{onFire * 10}%
        </motion.div>
      )}

      {/* Card Container — fixed size, overflow hidden, everything inside */}
      <div className={clsx(
        'w-44 h-[250px] rounded-xl overflow-hidden border-2 bg-slate-900 flex flex-col relative',
        rarityBorder[card.rarity] || 'border-slate-600',
        defeated && 'border-red-900/40',
        !defeated && lowHp && 'ring-2 ring-red-500/60 animate-pulse',
        !defeated && onFire && onFire > 0 && '!border-orange-500 shadow-[0_0_25px_rgba(249,115,22,0.6)]'
      )}>
        {/* Art */}
        <div className="relative h-[100px] w-full bg-slate-800 shrink-0">
          {card.avatarUrl ? (
            <img src={sizedAvatar(card.avatarUrl, 176)} alt={card.name} className="w-full h-full object-cover object-top" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500"><Sword size={36} /></div>
          )}
          {defeated && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
              <Skull size={40} className="text-red-500" weight="fill" />
            </div>
          )}
          {/* Language badge on art */}
          {card.primaryLanguage && (
            <span className="absolute top-1.5 left-1.5 text-[8px] bg-black/70 text-slate-200 border border-slate-600 rounded px-1.5 py-0.5 uppercase tracking-wider font-bold backdrop-blur-sm">
              {card.primaryLanguage}
            </span>
          )}
          <div className="absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-slate-900 to-transparent" />
        </div>

        {/* Name */}
        <div className="px-2 pt-1 text-center shrink-0">
          <h3 className="text-sm font-black text-white leading-tight truncate">{card.name}</h3>
        </div>

        {/* Stats: ATK & DEF */}
        <div className="px-2 pt-1 space-y-1 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-red-400 font-bold uppercase w-6">ATK</span>
            <div className="flex-1 h-1.5 bg-black rounded-full overflow-hidden">
              <div className="h-full bg-red-500 rounded-full" style={{ width: '100%' }} />
            </div>
            <span className="text-xs font-mono font-black text-red-400 w-7 text-right">{card.atk}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-blue-400 font-bold uppercase w-6">DEF</span>
            <div className="flex-1 h-1.5 bg-black rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: '100%' }} />
            </div>
            <span className="text-xs font-mono font-black text-blue-400 w-7 text-right">{card.def}</span>
          </div>
        </div>

        {/* HP Bar — always at bottom, INSIDE the card */}
        <div className="px-2 pb-2 mt-auto">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[9px] text-emerald-400 font-bold uppercase">HP</span>
            <span className="text-xs font-mono font-black text-white">{Math.max(0, hp)}<span className="text-slate-500">/{maxHp}</span></span>
          </div>
          <div className="relative h-2.5 bg-black rounded-full overflow-hidden border border-slate-700">
            {/* Damage trail: the lost HP lingers in a pale bar that drains after the hit */}
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-rose-200/70"
              initial={{ width: '100%' }}
              animate={{ width: `${hpPct}%` }}
              transition={{ duration: 0.6, delay: 0.35, ease: 'easeIn' }}
            />
            <motion.div
              className={clsx('relative h-full rounded-full bg-gradient-to-r', hpColor)}
              initial={{ width: '100%' }}
              animate={{ width: `${hpPct}%` }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Rarity shimmer for Epic/Legendary */}
        {(card.rarity === 'Epic' || card.rarity === 'Legendary') && !defeated && (
          <div className={clsx(
            'absolute inset-0 pointer-events-none opacity-20',
            card.rarity === 'Legendary' ? 'bg-gradient-to-br from-yellow-400/0 via-yellow-400/30 to-yellow-400/0' : 'bg-gradient-to-br from-purple-400/0 via-purple-400/20 to-purple-400/0'
          )} />
        )}
      </div>
    </motion.div>
    {defeated && !reduceMotion && <KoBurst rarity={card.rarity} />}
    </motion.div>
  );
}

// Battle Log Entry color
/** Two-letter badge of a player name in the replay's top bar. */
const badge = (name: string) => name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?';

const LOG_COLORS: Record<string, string> = {
  damage: 'text-red-400',
  passive: 'text-blue-400',
  synergy: 'text-cyan-400',
  defeat: 'text-red-500 font-bold',
  type_advantage: 'text-yellow-400',
  enter_field: 'text-emerald-400',
  draw: 'text-slate-400',
  battle_start: 'text-green-400',
  battle_end: 'text-yellow-300 font-bold',
};

const LOG_ICONS: Record<string, string> = {
  damage: '⚔️',
  passive: '✨',
  synergy: '🔗',
  defeat: '💀',
  type_advantage: '🔥',
  enter_field: '➡️',
  draw: '🤝',
  battle_start: '🥊',
  battle_end: '🏆',
};

export type RankedResult = { opponent: string | null; rating: { before: number; after: number } | null };

/** Loyalty milestones a card reached in this battle. */
export interface LoyaltyUnlock {
  cardId: string;
  cardName: string;
  milestones: { tier: string; title: string; atkDefBonus: number; hpBonus: number; cosmetics: string[] }[];
}

/** A battle the player just fought: what it paid and unlocked (absent when re-watching). */
export interface LiveBattleResult {
  rewards: BattleRewards;
  leagueMode?: string;
  /** Ranked battles: the opponent's name and the player's rating before / after. */
  ranked?: RankedResult | null;
  loyaltyUnlocks?: LoyaltyUnlock[];
  achievementsUnlocked?: AchievementUnlockNotice[];
}

/**
 * Animated battle replay, full screen. The bottom ("challenger") side is the
 * viewer's: swap the battle first (swapSides) to show it from the defender's chair.
 * Used right after a battle (`live`) and to re-watch one (/replay/<id>).
 */
export function BattleReplay({
  log,
  challengerTeam,
  defenderTeam,
  winnerSide,
  battleStats,
  live,
  names,
  spectator = false,
  shareSlot,
  onReset,
  resetLabel,
}: {
  log: TurnLog[];
  challengerTeam: TeamCard[];
  defenderTeam: TeamCard[];
  winnerSide: ReplaySide;
  battleStats?: BattleStat[];
  live?: LiveBattleResult;
  /** Player names over each side; "You" / "Opponent" when absent. */
  names?: { bottom: string; top: string };
  /** Someone else's battle: the result names the winner instead of Victory / Defeat. */
  spectator?: boolean;
  /** Share buttons for the replay link, shown on the results screen. */
  shareSlot?: React.ReactNode;
  onReset: () => void;
  /** Label of the reset button ("Fight again" by default). */
  resetLabel?: string;
}) {
  const notifyUnlocks = useNotifyAchievements();
  const t = useTranslations('battle');
  const battleText = useGameText('gameBattle');
  const achText = useGameText('gameAchievements');
  const reduceMotion = useReducedMotion();
  const rewards = live?.rewards;
  const leagueMode = live?.leagueMode;
  const ranked = live?.ranked;
  const loyaltyUnlocks = live?.loyaltyUnlocks;
  const achievementsUnlocked = live?.achievementsUnlocked;
  const bottomWon = winnerSide === 'CHALLENGER';
  const winnerName = names ? (bottomWon ? names.bottom : names.top) : '';
  const [currentTurn, setCurrentTurn] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<'normal' | 'fast'>('normal');
  const [floatingDmg, setFloatingDmg] = useState<{ id: number; value: number; side: 'top' | 'bottom'; isCrit?: boolean }[]>([]);
  
  // Audio system
  const { playSound, isMuted, toggleMuted } = useBattleAudio();
  const logEndRef = useRef<HTMLDivElement>(null);
  const dmgIdRef = useRef(0);

  // HP trackers
  const cHpTracker: Record<string, number> = {};
  const dHpTracker: Record<string, number> = {};
  challengerTeam.forEach(c => { cHpTracker[c.id] = c.maxHp; });
  defenderTeam.forEach(c => { dHpTracker[c.id] = c.maxHp; });

  // Momentum trackers
  const cMomentum: Record<string, number> = {};
  const dMomentum: Record<string, number> = {};

  for (let i = 0; i <= currentTurn && i < log.length; i++) {
    const turn = log[i];
    if (turn.cCardId) cHpTracker[turn.cCardId] = turn.cHpEnd;
    if (turn.dCardId) dHpTracker[turn.dCardId] = turn.dHpEnd;
    // Check for momentum in events
    turn.events.forEach(ev => {
      if (ev.type === 'passive' && ev.message.includes('On Fire!') && ev.cardId) {
        const match = ev.message.match(/\+(\d+)%/);
        const pct = match ? parseInt(match[1]) / 10 : 1;
        if (challengerTeam.some(c => c.id === ev.cardId)) cMomentum[ev.cardId!] = pct;
        else dMomentum[ev.cardId!] = pct;
      }
    });
  }

  // Score
  const cDefeated = challengerTeam.filter(c => (cHpTracker[c.id] ?? c.maxHp) <= 0).length;
  const dDefeated = defenderTeam.filter(c => (dHpTracker[c.id] ?? c.maxHp) <= 0).length;
  const cScore = dDefeated;
  const dScore = cDefeated;

  const activeCTurn = currentTurn < log.length ? log[currentTurn] : null;
  const activeCCardId = activeCTurn?.cCardId;
  const activeDCardId = activeCTurn?.dCardId;
  const done = currentTurn >= log.length - 1;

  // ── SEQUENCE STATE ──
  // Instead of just mapping over turns, we break each turn's events into sequence states for specific animations
  const [subseqIdx, setSubseqIdx] = useState(0); // Which event in the current turn we are playing
  const [activeAnim, setActiveAnim] = useState<'lunge' | 'projectile' | 'hit' | 'passive' | null>(null);
  // How hard the last hit landed: critical hits shake the screen and hold the impact longer
  const [impact, setImpact] = useState<'normal' | 'crit'>('normal');
  const [activePassiveMsg, setActivePassiveMsg] = useState<string | null>(null);
  const [isLogOpenMobile, setIsLogOpenMobile] = useState(false);
  const [showResults, setShowResults] = useState(false);
  // Achievement toasts wait for the results too (they'd spoil the outcome), shown once
  const achievementsRef = useRef(achievementsUnlocked);
  const isLive = !!live;
  const resultsSyncedRef = useRef(false);

  /** Shows the results; the first time, a live battle also syncs BITS and shows its achievement toasts. */
  const revealResults = useCallback(() => {
    setShowResults(true);
    if (!isLive || resultsSyncedRef.current) return;
    resultsSyncedRef.current = true;
    // Rewards were granted server-side; resync Navbar BITS / LevelUpModal now
    // (not at battle start, so the replay doesn't spoil the result).
    window.dispatchEvent(new Event('bits:refresh'));
    notifyUnlocks(achievementsRef.current);
    achievementsRef.current = undefined;
  }, [isLive, notifyUnlocks]);

  // Trigger end state hold
  useEffect(() => {
    if (done && !showResults) {
      playSound(bottomWon || spectator ? 'victory' : 'defeat');
      const timer = setTimeout(revealResults, 2500);
      return () => clearTimeout(timer);
    }
  }, [done, showResults, playSound, bottomWon, spectator, revealResults]);

  // Auto-play Sequencer: a timed state machine, so it sets the animation state
  // as each event starts (the timers below advance it).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!playing || done) return;

    const currentTurnObj = log[currentTurn];
    if (!currentTurnObj) return;

    // Fast skip path: if fast speed or no animations needed, just zip through turns
    if (speed === 'fast') {
      const timer = setTimeout(() => {
        setCurrentTurn(p => p + 1);
        const nextTurn = log[currentTurn + 1];
        if (nextTurn) {
          nextTurn.events.forEach(ev => {
            if (ev.type === 'damage' && ev.value && ev.value > 0) {
              const side = challengerTeam.some(c => c.id === ev.targetId) ? 'bottom' : 'top'; // bottom=player
              const id = ++dmgIdRef.current;
              setFloatingDmg(prev => [...prev, { id, value: ev.value!, side }]);
              setTimeout(() => setFloatingDmg(prev => prev.filter(d => d.id !== id)), 1000);
            }
          });
        }
      }, 300); // Super fast mode
      return () => clearTimeout(timer);
    } // End fast path
    
    // Detailed Sequence Path (Normal Speed)
    // We iterate through events[subseqIdx]
    const ev = currentTurnObj.events[subseqIdx];
    
    if (!ev) {
      // Finished all events in this turn, move to next turn
      const timer = setTimeout(() => {
        setCurrentTurn(p => p + 1);
        setSubseqIdx(0);
      }, 500); // 500ms delay between rounds
      return () => clearTimeout(timer);
    }

    let delay = 300; // default delay before next event
    
    if (ev.type === 'passive') {
      setActivePassiveMsg(ev.message);
      setActiveAnim('passive');
      playSound('passive');
      delay = 1200; // Hold the pause for banner
    } else if (ev.type === 'damage') {
      const isCrit = ev.message.includes('Critical');
      // Hit stop: the impact holds a beat before the next event (longer on a critical hit)
      const hold = isCrit ? 380 : 140;
      setActiveAnim('lunge'); // Trigger lunge
      playSound('lunge');
      delay = 800 + hold; // Total sequence (lunge, projectile, hit, hold)

      // Schedule the hit parts
      setTimeout(() => setActiveAnim('projectile'), 200);
      setTimeout(() => {
        setImpact(isCrit ? 'crit' : 'normal');
        setActiveAnim('hit');
        if (ev.value && ev.value > 0) {
          const side = challengerTeam.some(c => c.id === ev.targetId) ? 'bottom' : 'top';
          playSound(isCrit ? 'crit' : 'hit');
          const id = ++dmgIdRef.current;
          setFloatingDmg(prev => [...prev, { id, value: ev.value!, side, isCrit }]);
          setTimeout(() => setFloatingDmg(prev => prev.filter(d => d.id !== id)), 1500);
        }
      }, 400);
      setTimeout(() => setActiveAnim(null), 800 + hold);
    } else if (ev.type === 'enter_field') {
      delay = 800; // Entry animation time
    } else if (ev.type === 'defeat') {
      playSound('hit');
      delay = 1000; // The KO: the card breaks apart before the next one enters
    }

    const timer = setTimeout(() => {
      setActivePassiveMsg(null);
      setSubseqIdx(p => p + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [currentTurn, subseqIdx, playing, done, speed, log, challengerTeam, playSound]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentTurn, subseqIdx]);

  const handleSkip = () => {
    setPlaying(false);
    setCurrentTurn(log.length - 1);
    setSubseqIdx(log[log.length-1].events.length);
    revealResults(); // Jump straight to results
  };

  /** "Watch again": back to the first turn (rewards and toasts are never repeated). */
  const restart = () => {
    setFloatingDmg([]);
    setActiveAnim(null);
    setActivePassiveMsg(null);
    setSubseqIdx(0);
    setCurrentTurn(0);
    setShowResults(false);
    setPlaying(true);
  };

  // ── RESULTS SCREEN ──
  if (showResults) {
    return (
      <div className="fixed inset-0 z-[100] w-full h-[100dvh] bg-black/95 backdrop-blur-md overflow-y-auto isolate py-10 px-4">
        <div className="space-y-6 max-w-4xl mx-auto mt-10">
          {/* Winner announcement */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200 }}
          className="text-center"
        >
          <div className={clsx(
            'inline-block px-12 py-8 rounded-3xl border-2',
            bottomWon || spectator
              ? 'bg-gradient-to-br from-yellow-500/10 to-amber-500/5 border-yellow-500/30'
              : 'bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/30'
          )}>
            {bottomWon || spectator
              ? <Trophy size={64} weight="fill" className="text-yellow-400 mx-auto mb-3" />
              : <Skull size={64} weight="fill" className="text-red-400 mx-auto mb-3" />
            }
            <h2 className={clsx('font-black', spectator ? 'text-4xl' : 'text-5xl', bottomWon || spectator ? 'text-yellow-400' : 'text-red-400')}>
              {spectator ? t('results.winnerIs', { name: winnerName }) : bottomWon ? t('results.victory') : t('results.defeat')}
            </h2>
            {leagueMode && leagueMode !== 'OPEN' && leagueMode !== 'RANKED' && (
              <p className="text-xs text-slate-500 mt-2 uppercase tracking-wider">{battleText(`leagues.${leagueMode}.label`, LEAGUES[leagueMode as LeagueMode]?.label ?? leagueMode)}</p>
            )}
            {ranked && (
              <div className="mt-3 flex flex-col items-center gap-2">
                <p className="text-xs text-slate-400 uppercase tracking-wider">{ranked.opponent ? t('results.rankedVs', { opponent: ranked.opponent }) : t('results.ranked')}</p>
                {ranked.rating && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-slate-400">{ranked.rating.before}</span>
                    <span className="text-slate-500">→</span>
                    <span className="font-mono font-bold text-white">{ranked.rating.after}</span>
                    <span className={`font-mono font-bold ${ranked.rating.after >= ranked.rating.before ? 'text-emerald-300' : 'text-rose-300'}`}>
                      ({ranked.rating.after >= ranked.rating.before ? '+' : ''}{ranked.rating.after - ranked.rating.before})
                    </span>
                    <RankBadge rating={ranked.rating.after} showRating={false} />
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {/* Animated Rewards */}
        {rewards && <div className="flex gap-8 justify-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3, type: 'spring' }} className="text-center">
            <motion.span animate={{ opacity: [0, 1] }} transition={{ delay: 0.5 }} className="text-yellow-400 font-black text-3xl">+{rewards.bits}</motion.span>
            <p className="text-[10px] uppercase text-slate-400 tracking-wider mt-1">Bits</p>
            {!!rewards.upsetBonusPct && (
              <motion.p
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
                className="mt-1 text-[10px] font-bold uppercase tracking-wider text-commit"
                title={t('results.upsetTitle')}
              >
                {t('results.upset', { percent: Math.round(rewards.upsetBonusPct * 100) })}
              </motion.p>
            )}
          </motion.div>
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5, type: 'spring' }} className="text-center">
            <motion.span animate={{ opacity: [0, 1] }} transition={{ delay: 0.7 }} className="text-blue-400 font-black text-3xl">+{rewards.xp}</motion.span>
            <p className="text-[10px] uppercase text-slate-400 tracking-wider mt-1">XP</p>
          </motion.div>
        </div>}

        {/* Battle Summary by matchup */}
        {battleStats && battleStats.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between pointer-events-auto">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><ChartBar size={16} className="text-purple-400" /> {t('results.summary')}</h3>
              <a href="/wiki#battle-system" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 z-50 relative pointer-events-auto">
                <BookOpenText size={14} weight="bold" /> {t('header.wiki')}
              </a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {battleStats.map((stat, i) => (
                <div key={i} className={clsx('rounded-xl p-3 border', stat.team === 'CHALLENGER' ? 'border-blue-500/20 bg-blue-500/5' : 'border-red-500/20 bg-red-500/5')}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white">{stat.name}</span>
                    <span className={clsx('text-[10px] uppercase tracking-wider', stat.team === 'CHALLENGER' ? 'text-blue-400' : 'text-red-400')}>{stat.team === 'CHALLENGER' ? t('history.challenger') : t('history.defender')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    <span className="text-slate-500">{t('results.damageDealt')}</span><span className="text-right text-red-400 font-bold">{stat.damageDealt}</span>
                    <span className="text-slate-500">{t('results.damageTaken')}</span><span className="text-right text-orange-400 font-bold">{stat.damageReceived}</span>
                    <span className="text-slate-500">{t('results.passives')}</span><span className="text-right text-blue-400 font-bold">{stat.passivesTriggered}</span>
                    {stat.momentumAchieved && <><span className="text-slate-500">{t('results.momentum')}</span><span className="text-right text-orange-400 font-bold">{t('results.momentumYes')}</span></>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loyalty Milestone Notifications */}
        {loyaltyUnlocks && loyaltyUnlocks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, type: 'spring' }}
            className="space-y-3"
          >
            {loyaltyUnlocks.map((unlock, i) => (
              <div
                key={i}
                className="bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-amber-500/10 border-2 border-yellow-500/30 rounded-2xl p-5 relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-400/5 to-transparent animate-pulse pointer-events-none" />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">🏆</span>
                    <div>
                      <h4 className="text-lg font-black text-yellow-400">{t('results.loyaltyMilestone')}</h4>
                      <p className="text-sm text-white font-bold">{unlock.cardName}</p>
                    </div>
                  </div>
                  {unlock.milestones.map((m, mi) => (
                    <div key={mi} className="flex items-center gap-3 bg-black/30 rounded-xl px-4 py-3 mt-2">
                      <div className="text-center">
                        <p className="text-xs text-slate-400 uppercase">{t('results.newTitle')}</p>
                        <p className="text-lg font-black text-yellow-300">{achText(`loyalty.${m.tier}.title`, m.title)}</p>
                      </div>
                      <div className="flex-1 flex flex-wrap gap-2 ml-4">
                        <span className="text-xs bg-red-500/20 text-red-400 font-bold px-2 py-1 rounded-lg border border-red-500/30">
                          +{Math.round(m.atkDefBonus * 100)}% ATK/DEF
                        </span>
                        {m.hpBonus > 0 && (
                          <span className="text-xs bg-green-500/20 text-green-400 font-bold px-2 py-1 rounded-lg border border-green-500/30">
                            +{Math.round(m.hpBonus * 100)}% HP
                          </span>
                        )}
                        {m.cosmetics.filter((c: string) => !c.includes('badge')).map((cosmetic: string, ci: number) => (
                          <span key={ci} className="text-xs bg-purple-500/20 text-purple-400 font-bold px-2 py-1 rounded-lg border border-purple-500/30">
                            ✨ {achText(`loyaltyCosmetics.${cosmetic}`, cosmetic.replace(/_/g, ' '))}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {/* Stamina Summary */}
        {isLive && <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 text-center text-sm text-slate-300">
          <div className="flex items-center justify-center gap-2 text-orange-400 font-bold mb-1">
            <Star size={16} weight="fill" /> {t('results.staminaPenalty')}
          </div>
          <p>{t.rich('results.staminaLost', { b: chunks => <span className="text-red-400 font-bold">{chunks}</span> })}</p>
          <p className="text-[10px] mt-1 text-slate-500">
            <Lightning size={10} className="inline mr-1 text-yellow-500" />
            {t.rich('results.fatigued', { link: chunks => <a href="/collection" className="text-indigo-400 hover:text-indigo-300 underline font-bold">{chunks}</a> })}
          </p>
        </div>}

        {/* Share the replay link */}
        {shareSlot && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col items-center gap-3">
            <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">{t('results.shareReplay')}</p>
            {shareSlot}
          </div>
        )}

        {/* Watch again / Fight again (or close) */}
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={restart}
            className="px-6 py-4 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-2xl font-bold transition-all flex items-center gap-2"
          >
            <ArrowCounterClockwise size={20} weight="bold" /> {t('results.watchAgain')}
          </button>
          <button
            onClick={onReset}
            className="px-10 py-4 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white rounded-2xl font-black text-lg transition-all shadow-[0_0_30px_rgba(220,38,38,0.3)] flex items-center gap-3"
          >
            {resetLabel ? <X size={22} weight="bold" /> : <ArrowClockwise size={22} weight="bold" />} {resetLabel ?? t('results.fightAgain')}
          </button>
        </div>
      </div>
    </div>
    );
  }

  // ── BATTLE IN PROGRESS ──
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        // Screen shake on impact: a nudge on a normal hit, a hard jolt on a critical one
        x: activeAnim === 'hit' && !reduceMotion ? (impact === 'crit' ? [-16, 14, -12, 10, -6, 0] : [-4, 4, -2, 0]) : 0,
        y: activeAnim === 'hit' && !reduceMotion && impact === 'crit' ? [8, -6, 4, 0] : 0,
      }}
      transition={{ duration: impact === 'crit' ? 0.35 : 0.15 }}
      className="fixed inset-0 z-[100] w-full h-[100dvh] bg-[#0a0c14] isolate overflow-hidden flex flex-col"
    >
      {/* ═══ ARENA BACKGROUND ═══ */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-[#060810] via-[#0d1020] to-transparent" />
        <div className="absolute bottom-0 inset-x-0 h-1/2 bg-gradient-to-t from-[#12101a] via-[#0d0f18] to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,160,60,0.06)_0%,transparent_70%)]" />
        <div className="absolute top-0 left-0 w-1/3 h-full bg-[radial-gradient(ellipse_at_left,rgba(59,130,246,0.04)_0%,transparent_60%)]" />
        <div className="absolute top-0 right-0 w-1/3 h-full bg-[radial-gradient(ellipse_at_right,rgba(239,68,68,0.04)_0%,transparent_60%)]" />
        {/* Floating particles */}
        <div className="absolute inset-0 overflow-hidden">
          {Array.from({ length: 15 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-orange-300/20"
              style={{
                left: `${10 + (i * 6.2) % 80}%`,
                top: `${5 + (i * 7.3) % 90}%`,
                animation: `battleFloat ${6 + (i % 5) * 2}s ease-in-out infinite ${(i % 4) * 1.5}s`,
              }}
            />
          ))}
        </div>
        <div className="absolute top-1/2 inset-x-0 h-px bg-gradient-to-r from-transparent via-orange-500/15 to-transparent" />
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {activePassiveMsg && <PassiveBanner message={activePassiveMsg} />}
      </AnimatePresence>
      <AnimatePresence>
        {done && !showResults && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <h2 className={clsx('font-black drop-shadow-[0_0_30px_currentColor] mb-4 text-center px-4', spectator ? 'text-5xl' : 'text-7xl', bottomWon || spectator ? 'text-yellow-400' : 'text-red-500')}>
              {spectator ? t('results.winnerIs', { name: winnerName }) : bottomWon ? t('replay.victory') : t('replay.defeat')}
            </h2>
            <div className="text-5xl">{bottomWon || spectator ? '🏆✨' : '💀🔥'}</div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {activeAnim === 'hit' && (
          <motion.div
            initial={{ opacity: 0.25 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-white pointer-events-none z-40 mix-blend-overlay"
          />
        )}
      </AnimatePresence>

      {/* ═══ Z1: TOP BAR (60px) ═══ */}
      <div className="h-[60px] shrink-0 flex items-center justify-between px-4 relative z-20 bg-black/40 border-b border-slate-800/50 backdrop-blur-sm">
        {/* Opponent Info */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center text-sm font-black text-white border-2 border-red-400 shadow-[0_0_12px_rgba(220,38,38,0.4)]">
            {names ? badge(names.top) : t('replay.oppBadge')}
          </div>
          <div>
            <p className="text-sm font-bold text-white max-w-[30vw] truncate">{names?.top ?? t('replay.opponent')}</p>
            <div className="flex gap-1 mt-0.5">
              {defenderTeam.map((card) => {
                const cardHp = dHpTracker[card.id] ?? card.maxHp;
                const isDefeated = cardHp <= 0;
                const isActive = card.id === activeDCardId;
                return (
                  <motion.div
                    key={card.id}
                    animate={{ opacity: isDefeated ? 0.2 : 1, scale: isDefeated ? 0.8 : 1 }}
                    className={clsx(
                      'w-5 h-7 rounded-sm border',
                      isActive ? 'border-red-400 bg-red-500/30' : isDefeated ? 'border-slate-700 bg-slate-800' : 'bg-[repeating-linear-gradient(45deg,#1e293b,#1e293b_2px,#0f172a_2px,#0f172a_4px)] border-slate-600'
                    )}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Score Pill */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center bg-black/60 px-6 py-1.5 rounded-full border border-slate-700/60 backdrop-blur-md shadow-xl">
          <div className="flex items-center gap-4">
            <span className="text-2xl font-mono font-black text-blue-400">{cScore}</span>
            <span className="text-lg text-slate-500 font-bold">–</span>
            <span className="text-2xl font-mono font-black text-red-400">{dScore}</span>
          </div>
          <p className="text-[9px] uppercase text-slate-500 tracking-widest font-bold -mt-0.5">{t('replay.round', { round: Math.min(currentTurn + 1, log.length) })}</p>
        </div>

        {/* Player Info */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-bold text-white max-w-[30vw] truncate">{names?.bottom ?? t('replay.you')}</p>
            <div className="flex gap-1 justify-end mt-0.5">
              {challengerTeam.map((card) => {
                const cardHp = cHpTracker[card.id] ?? card.maxHp;
                const isDefeated = cardHp <= 0;
                const isActive = card.id === activeCCardId;
                return (
                  <motion.div
                    key={card.id}
                    animate={{ opacity: isDefeated ? 0.2 : 1, scale: isDefeated ? 0.8 : 1 }}
                    className={clsx(
                      'w-5 h-7 rounded-sm border',
                      isActive ? 'border-blue-400 bg-blue-500/30' : isDefeated ? 'border-slate-700 bg-slate-800' : 'bg-gradient-to-b from-blue-900 to-slate-900 border-slate-600'
                    )}
                  />
                );
              })}
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-sm font-black text-white border-2 border-blue-400 shadow-[0_0_12px_rgba(79,70,229,0.4)]">
            {names ? badge(names.bottom) : t('replay.youBadge')}
          </div>
        </div>
      </div>

      {/* ═══ MAIN ARENA (Z2 + Z3 + Z4 + Battle Log) ═══ */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Card Arena (left of log) */}
        <div className="flex-1 flex flex-col min-h-0 sm:mr-[280px]">

          {/* Z2: Opponent Field */}
          <div className="flex-[35] flex items-center justify-center relative min-h-0">
            <AnimatePresence>
              {defenderTeam.map(card => {
                if (card.id !== activeDCardId) return null;
                const cardHp = dHpTracker[card.id] ?? card.maxHp;
                const ev = log[currentTurn]?.events[subseqIdx];
                const isAttacking = activeAnim === 'lunge' && ev?.cardId === card.id;
                const isDefending = activeAnim === 'hit' && ev?.targetId === card.id;
                return (
                  <BattleFieldCard
                    key={card.id}
                    card={card}
                    hp={cardHp}
                    maxHp={card.maxHp}
                    side="top"
                    defeated={cardHp <= 0}
                    onFire={dMomentum[card.id]}
                    isAttacking={isAttacking}
                    isDefending={isDefending}
                  />
                );
              })}
            </AnimatePresence>
            <AnimatePresence>
              {floatingDmg.filter(d => d.side === 'top').map(d => (
                <FloatingDamage key={d.id} value={d.value} side={d.side} isCrit={d.isCrit} />
              ))}
            </AnimatePresence>
          </div>

          {/* Z3: Center Divider (40px) */}
          <div className="h-10 shrink-0 flex items-center justify-center relative z-10">
            <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-orange-500/30 to-transparent" />
            <div className="relative bg-gradient-to-br from-orange-600 to-red-700 w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm border-2 border-orange-400 shadow-[0_0_20px_rgba(234,88,12,0.4)]">
              VS
            </div>
            <AnimatePresence>
              {activeAnim === 'projectile' && (
                <CombatProjectile
                  from={log[currentTurn]?.events[subseqIdx]?.cardId === activeCCardId ? 'bottom' : 'top'}
                  language={
                    log[currentTurn]?.events[subseqIdx]?.cardId === activeCCardId
                      ? challengerTeam.find(c => c.id === activeCCardId)?.primaryLanguage
                      : defenderTeam.find(c => c.id === activeDCardId)?.primaryLanguage
                  }
                />
              )}
            </AnimatePresence>
          </div>

          {/* Z4: Player Field */}
          <div className="flex-[35] flex items-center justify-center relative min-h-0">
            <AnimatePresence>
              {challengerTeam.map(card => {
                if (card.id !== activeCCardId) return null;
                const cardHp = cHpTracker[card.id] ?? card.maxHp;
                const ev = log[currentTurn]?.events[subseqIdx];
                const isAttacking = activeAnim === 'lunge' && ev?.cardId === card.id;
                const isDefending = activeAnim === 'hit' && ev?.targetId === card.id;
                return (
                  <BattleFieldCard
                    key={card.id}
                    card={card}
                    hp={cardHp}
                    maxHp={card.maxHp}
                    side="bottom"
                    defeated={cardHp <= 0}
                    onFire={cMomentum[card.id]}
                    isAttacking={isAttacking}
                    isDefending={isDefending}
                  />
                );
              })}
            </AnimatePresence>
            <AnimatePresence>
              {floatingDmg.filter(d => d.side === 'bottom').map(d => (
                <FloatingDamage key={d.id} value={d.value} side={d.side} isCrit={d.isCrit} />
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Battle Log Panel (280px right column) */}
        <div className={clsx(
          "absolute right-0 top-0 bottom-0 w-[280px] bg-black/60 border-l border-orange-500/20 flex flex-col backdrop-blur-md z-30 transition-transform duration-300",
          isLogOpenMobile ? "translate-x-0" : "translate-x-full sm:translate-x-0"
        )}>
          <div className="px-4 py-3 border-b border-slate-800/80 bg-gradient-to-r from-slate-900/80 to-slate-900/60 flex justify-between items-center">
            <p className="text-xs uppercase tracking-widest text-orange-400 font-bold flex items-center gap-2">
              <Sword size={14} weight="fill" /> {t('replay.log')}
            </p>
            <button className="sm:hidden text-slate-500 hover:text-white transition-colors" onClick={() => setIsLogOpenMobile(false)}>✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700">
            {log.slice(0, currentTurn + 1).map((turn, ti) =>
              turn.events.filter((_, idx) => ti < currentTurn || idx <= subseqIdx).map((ev, ei) => (
                <motion.div
                  key={`${ti}-${ei}`}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-2.5 py-1.5 px-2 rounded-lg hover:bg-slate-800/30 transition-colors"
                >
                  <span className="flex-shrink-0 text-base leading-none mt-0.5">{LOG_ICONS[ev.type] || '•'}</span>
                  <span className={clsx('text-[11px] leading-snug flex-1', LOG_COLORS[ev.type] || 'text-slate-400')}>{ev.message}</span>
                </motion.div>
              ))
            )}
            <div ref={logEndRef} className="h-4" />
          </div>
        </div>
      </div>

      {/* ═══ Z5: BOTTOM BENCH BAR (120px) ═══ */}
      <div className="h-[120px] shrink-0 flex items-center justify-between px-4 gap-4 bg-black/50 border-t border-slate-800/50 backdrop-blur-sm relative z-20">
        {/* Player Bench Cards */}
        <div className="flex gap-3 items-end">
          {challengerTeam.map((card) => {
            const cardHp = cHpTracker[card.id] ?? card.maxHp;
            const hpPct = Math.max(0, (cardHp / card.maxHp) * 100);
            const isDefeated = cardHp <= 0;
            const isActive = card.id === activeCCardId;
            const rarityColor: Record<string, string> = { Common: 'bg-slate-500', Uncommon: 'bg-green-500', Rare: 'bg-blue-500', Epic: 'bg-purple-500', Legendary: 'bg-yellow-400' };

            return (
              <div key={card.id} className={clsx('flex flex-col items-center gap-1 transition-all', isDefeated && 'opacity-40')}>
                <div className={clsx(
                  'w-20 h-[90px] rounded-lg overflow-hidden border-2 relative bg-slate-800 transition-all',
                  isActive && !isDefeated ? 'border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)] scale-105' : isDefeated ? 'border-slate-700 grayscale' : 'border-slate-700 hover:border-slate-600'
                )}>
                  {card.avatarUrl ? (
                    <img src={sizedAvatar(card.avatarUrl, 90)} className="w-full h-full object-cover" alt={card.name} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Sword className="text-slate-500" size={24} /></div>
                  )}
                  {isDefeated && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                      <Skull className="text-red-500" size={28} weight="fill" />
                    </div>
                  )}
                  {isActive && !isDefeated && (
                    <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-400 animate-pulse shadow-[0_0_6px_rgba(59,130,246,0.8)]" />
                  )}
                </div>
                <div className="w-20 h-1.5 bg-black rounded-full overflow-hidden border border-slate-700">
                  <div className={clsx('h-full rounded-full transition-all', rarityColor[card.rarity] || 'bg-slate-500')} style={{ width: `${hpPct}%` }} />
                </div>
                <div className="w-1.5 h-1.5 rounded-full bg-green-400/60" />
              </div>
            );
          })}
        </div>

        {/* Controls Cluster */}
        <div className="flex items-center gap-1.5 bg-black/70 px-3 py-2 rounded-xl border border-slate-700/60 backdrop-blur-sm shadow-lg">
          <button className="sm:hidden p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all" onClick={() => setIsLogOpenMobile(true)} title={t('replay.log')}>
            <Clock size={18} />
          </button>
          <button
            onClick={toggleMuted}
            className={clsx('p-2 rounded-lg transition-all', isMuted ? 'text-slate-500 hover:text-white hover:bg-slate-800' : 'text-orange-400 hover:bg-orange-500/10')}
            title={isMuted ? t('replay.unmute') : t('replay.mute')}
            aria-label={isMuted ? t('replay.unmuteSounds') : t('replay.muteSounds')}
            aria-pressed={isMuted}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
          <div className="w-px h-6 bg-slate-700" />
          <button
            onClick={() => setPlaying(p => !p)}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-all"
            title={playing ? t('replay.pause') : t('replay.play')}
          >
            {playing ? '⏸' : '▶'}
          </button>
          <button
            onClick={() => setSpeed(s => s === 'normal' ? 'fast' : 'normal')}
            className={clsx('p-2 rounded-lg transition-all font-mono font-bold text-sm', speed === 'fast' ? 'bg-orange-500/20 text-orange-400' : 'hover:bg-slate-800 text-slate-400 hover:text-white')}
            title={t('replay.toggleSpeed')}
          >
            {speed === 'fast' ? '2×' : '1×'}
          </button>
          <button
            onClick={handleSkip}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-all"
            title={t('replay.skip')}
          >
            <ArrowRight size={18} />
          </button>
        </div>
      </div>

      {/* Particle animation keyframes */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes battleFloat {
          0%, 100% { transform: translateY(0px) translateX(0px); opacity: 0.15; }
          25% { transform: translateY(-20px) translateX(10px); opacity: 0.35; }
          50% { transform: translateY(-10px) translateX(-5px); opacity: 0.1; }
          75% { transform: translateY(-30px) translateX(15px); opacity: 0.25; }
        }
      `}} />
    </motion.div>
  );
}

