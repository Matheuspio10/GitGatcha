'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardProps } from '@/components/Card';
import TeamBuilderUI, { TeamBuilderCard } from '@/components/TeamBuilderUI';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import {
  Sword, Shield, Heart, Lightning, Trophy, Clock, Users,
  GameController, ArrowClockwise, Skull, Sparkle, ArrowRight, Star, ChartBar, BookOpenText
} from '@phosphor-icons/react';
import { useSearchParams } from 'next/navigation';

// Types
interface TurnEvent {
  type: 'damage' | 'passive' | 'synergy' | 'defeat' | 'type_advantage' | 'enter_field' | 'draw' | 'battle_start' | 'battle_end';
  cardId?: string;
  targetId?: string;
  value?: number;
  message: string;
}

interface TurnLog {
  turnNumber: number;
  cCardId: string;
  dCardId: string;
  cHpStart: number;
  dHpStart: number;
  cHpEnd: number;
  dHpEnd: number;
  events: TurnEvent[];
}

interface TeamCard {
  id: string;
  name: string;
  atk: number;
  def: number;
  hp: number;
  maxHp: number;
  rarity: string;
  primaryLanguage?: string | null;
  avatarUrl?: string | null;
}

type Tab = 'Quick Battle' | 'Challenge' | 'History';

const RARITY_GLOW: Record<string, string> = {
  Common: 'ring-slate-500',
  Uncommon: 'ring-green-500',
  Rare: 'ring-blue-500',
  Epic: 'ring-purple-500',
  Legendary: 'ring-yellow-400',
};

const EVENT_COLOR: Record<string, string> = {
  damage: 'text-red-400',
  passive: 'text-purple-400',
  synergy: 'text-cyan-400',
  defeat: 'text-red-500',
  type_advantage: 'text-yellow-400',
  enter_field: 'text-blue-400',
  draw: 'text-slate-400',
  battle_start: 'text-green-400',
  battle_end: 'text-yellow-300',
};

const EVENT_ICON: Record<string, string> = {
  damage: '⚔️',
  passive: '✨',
  synergy: '🔗',
  defeat: '💀',
  type_advantage: '🔥',
  enter_field: '→',
  draw: '🤝',
  battle_start: '🥊',
  battle_end: '🏆',
};

function StatBar({ label, current, max, color, large }: { label: string; current: number; max: number; color: string; large?: boolean }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const hpColor = label === 'HP' ? (pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-yellow-500' : 'bg-red-500') : color;
  return (
    <div className={clsx('w-full', large ? 'space-y-0.5' : 'space-y-0')}>
      <div className="flex justify-between text-[9px]">
        <span className="text-slate-500 uppercase tracking-wider">{label}</span>
        <span className="text-slate-400 font-bold">{Math.max(0, current)}/{max}</span>
      </div>
      <div className={clsx('w-full rounded-full overflow-hidden', large ? 'h-3 bg-slate-800' : 'h-1.5 bg-slate-800/60')}>
        <motion.div
          className={clsx('h-full rounded-full', hpColor)}
          initial={{ width: '100%' }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

function FloatingDamage({ value, side, isCrit }: { value: number; side: 'top' | 'bottom'; isCrit?: boolean }) {
  const fontSize = Math.min(48, 20 + Math.floor(value / 100) * 6);
  return (
    <motion.div
      initial={{ opacity: 1, y: 0, scale: 0.5 }}
      animate={{ opacity: 0, y: side === 'top' ? 80 : -80, scale: 1.5 }}
      transition={{ duration: 1.0, ease: 'easeOut' }}
      className={clsx(
        'absolute z-40 font-black pointer-events-none drop-shadow-lg',
        side === 'top' ? 'top-10 left-1/2 -ml-8' : 'bottom-10 left-1/2 -ml-8',
        isCrit ? 'text-yellow-300' : 'text-red-500'
      )}
      style={{ fontSize }}
    >
      {isCrit && <div className="text-[10px] uppercase text-yellow-200 text-center -mb-2 tracking-widest bg-black/50 px-2 rounded-full w-fit mx-auto border border-yellow-500/50">CRIT</div>}
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

// Active Card on battlefield
function BattleFieldCard({ card, hp, maxHp, side, defeated, onFire, isAttacking, isDefending }: {
  card: TeamCard; hp: number; maxHp: number; side: 'left' | 'right' | 'top' | 'bottom'; defeated?: boolean; onFire?: number;
  isAttacking?: boolean; isDefending?: boolean;
}) {
  const lowHp = hp > 0 && hp < maxHp * 0.25;
  const isTop = side === 'top';
  
  // Rarity Effects
  const getRarityAura = (rarity: string) => {
    switch (rarity) {
      case 'Rare': return 'ring-2 ring-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.3)]';
      case 'Epic': return 'ring-4 ring-purple-500/60 shadow-[0_0_25px_rgba(168,85,247,0.4)]';
      case 'Legendary': return 'ring-4 ring-yellow-400 shadow-[0_0_35px_rgba(250,204,21,0.6)] animate-[pulse_2s_ease-in-out_infinite]';
      default: return 'border-2 border-slate-600';
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: isTop ? -80 : 80, scale: 0.8, rotateX: 30 }}
      animate={{
        opacity: defeated ? 0.2 : 1,
        y: isAttacking ? (isTop ? 20 : -20) : 0,
        x: isDefending ? [0, -5, 5, -5, 5, 0] : 0,
        scale: defeated ? 0.85 : 1,
        rotateX: defeated ? 60 : 10,
        filter: defeated ? 'grayscale(100%) blur(2px)' : 'none',
        zIndex: isAttacking ? 20 : 10
      }}
      exit={{ opacity: 0, scale: 0.5, rotateY: 90 }}
      transition={{ 
        type: 'spring', stiffness: 250, damping: 25,
        x: { duration: 0.4 }, // hit shake
      }}
      className={clsx(
        'relative flex flex-col items-center gap-3',
        lowHp && !defeated && 'animate-[pulse_1s_ease-in-out_infinite]',
        isTop ? 'mb-4' : 'mt-4'
      )}
      style={{ perspective: '1000px', transformStyle: 'preserve-3d' }}
    >
      {/* Rarity particles - simplified here for Epic/Legendary */}
      {(!defeated && (card.rarity === 'Epic' || card.rarity === 'Legendary')) && (
        <div className="absolute inset-0 -m-4 rounded-xl border border-white/10 flex items-center justify-center animate-spin-slow pointer-events-none opacity-50 block" style={{ borderRadius: '50%' }}>
           <div className={`w-2 h-2 rounded-full absolute top-0 ${card.rarity === 'Legendary' ? 'bg-yellow-400 shadow-[0_0_10px_yellow]' : 'bg-purple-400 shadow-[0_0_10px_purple]'}`} />
           <div className={`w-2 h-2 rounded-full absolute bottom-0 ${card.rarity === 'Legendary' ? 'bg-yellow-400 shadow-[0_0_10px_yellow]' : 'bg-purple-400 shadow-[0_0_10px_purple]'}`} />
        </div>
      )}

      {/* On Fire/Momentum badge */}
      {onFire && onFire > 0 && !defeated && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ repeat: Infinity, duration: 1.2 }}
          className="absolute -top-4 -right-4 z-30 bg-gradient-to-br from-orange-400 via-red-500 to-red-700 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-[0_0_20px_rgba(239,68,68,0.8)] border border-orange-300 transform rotate-12"
        >
          🔥 +{onFire * 10}%
        </motion.div>
      )}

      {/* Card Body */}
      <div className={clsx(
        'relative bg-slate-900 rounded-xl overflow-hidden shadow-2xl w-48 h-[270px] flex flex-col',
        getRarityAura(card.rarity),
        defeated ? 'border-red-900/30' : lowHp ? 'ring-4 ring-red-500 shadow-[0_0_30px_rgba(239,68,68,0.6)]' : '',
        onFire && onFire > 0 && !defeated && '!ring-4 !ring-orange-500 shadow-[0_0_30px_rgba(249,115,22,0.8)]'
      )}>
        {/* Avatar Area */}
        <div className="relative h-36 w-full bg-slate-800">
          {card.avatarUrl ? (
            <img src={card.avatarUrl} alt={card.name} className="w-full h-full object-cover object-top" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-600"><Sword size={40} /></div>
          )}
          {defeated && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm">
              <Skull size={60} className="text-red-500" weight="fill" />
            </div>
          )}
          <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-slate-900 to-transparent" />
        </div>

        {/* Info Area */}
        <div className="px-3 pb-3 pt-1 flex-1 flex flex-col z-10 -mt-4">
          <div className="text-center mb-2">
            <h3 className="text-base font-black text-white leading-tight min-h-[40px] flex items-center justify-center drop-shadow-md">{card.name}</h3>
            {card.primaryLanguage && (
              <span className="text-[9px] bg-slate-800/80 border border-slate-700 text-slate-300 rounded px-2 py-0.5 inline-block uppercase tracking-wider font-bold shadow-sm">
                {card.primaryLanguage}
              </span>
            )}
          </div>

          <div className="mt-auto space-y-1.5 w-full bg-black/40 p-2 rounded-lg border border-slate-800/50">
            <StatBar label="ATK" current={card.atk} max={card.atk} color="bg-red-500" />
            <StatBar label="DEF" current={card.def} max={card.def} color="bg-blue-500" />
          </div>
        </div>
      </div>

      {/* Prominent external HP Bar */}
      <div className="w-48 mt-1 relative z-20">
        <div className="absolute -top-7 left-1/2 -ml-6 bg-black text-white font-black text-xs px-3 py-1 rounded-t-lg border border-b-0 border-slate-700 shadow-lg">
          {Math.max(0, hp)} / {maxHp}
        </div>
        <div className="bg-slate-950 p-1.5 rounded-xl border-2 border-slate-800 shadow-xl overflow-visible relative">
           <div className="w-full h-4 bg-black rounded-lg overflow-hidden relative">
             <motion.div
               className={clsx('h-full', hp > maxHp * 0.5 ? 'bg-gradient-to-r from-emerald-600 to-green-400' : hp > maxHp * 0.25 ? 'bg-gradient-to-r from-yellow-600 to-yellow-400' : 'bg-gradient-to-r from-red-700 to-red-500')}
               initial={{ width: '100%' }}
               animate={{ width: `${Math.max(0, Math.min(100, (hp / maxHp) * 100))}%` }}
               transition={{ duration: 0.5, ease: 'easeOut' }}
             />
             {/* Gloss overlay */}
             <div className="absolute inset-x-0 top-0 h-1.5 bg-white/20" />
           </div>
        </div>
      </div>
      
      {/* Status Indicators Container */}
      <div className="flex gap-2">
        {/* Placeholder for stamina / type advantage indicators which we will populate from state later */}
      </div>

    </motion.div>
  );
}

// Battle Log Entry color
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

// Animated battle replay — FULL REDESIGN
function BattleReplay({
  log,
  challengerTeam,
  defenderTeam,
  winnerSide,
  rewards,
  onReset,
  userId,
  leagueMode,
  battleStats,
  loyaltyUnlocks,
}: {
  log: TurnLog[];
  challengerTeam: TeamCard[];
  defenderTeam: TeamCard[];
  winnerSide: 'CHALLENGER' | 'DEFENDER';
  rewards: { bits: number; xp: number };
  onReset: () => void;
  userId: string;
  leagueMode?: string;
  battleStats?: any[];
  loyaltyUnlocks?: { cardId: string; cardName: string; milestones: { tier: string; title: string; atkDefBonus: number; hpBonus: number; cosmetics: string[] }[] }[];
}) {
  const [currentTurn, setCurrentTurn] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<'normal' | 'fast'>('normal');
  const [floatingDmg, setFloatingDmg] = useState<{ id: number; value: number; side: 'top' | 'bottom'; isCrit?: boolean }[]>([]);
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
    const t = log[i];
    if (t.cCardId) cHpTracker[t.cCardId] = t.cHpEnd;
    if (t.dCardId) dHpTracker[t.dCardId] = t.dHpEnd;
    // Check for momentum in events
    t.events.forEach(ev => {
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

  const interval = speed === 'fast' ? 400 : 1500;

  // ── SEQUENCE STATE ──
  // Instead of just mapping over turns, we break each turn's events into sequence states for specific animations
  const [subseqIdx, setSubseqIdx] = useState(0); // Which event in the current turn we are playing
  const [activeAnim, setActiveAnim] = useState<'lunge' | 'projectile' | 'hit' | 'passive' | null>(null);
  const [activePassiveMsg, setActivePassiveMsg] = useState<string | null>(null);
  const [isLogOpenMobile, setIsLogOpenMobile] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Trigger end state hold
  useEffect(() => {
    if (done) {
      const timer = setTimeout(() => setShowResults(true), 2500);
      return () => clearTimeout(timer);
    }
  }, [done]);

  // Auto-play Sequencer
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
      delay = 1200; // Hold the pause for banner
    } else if (ev.type === 'damage') {
      setActiveAnim('lunge'); // Trigger lunge
      delay = 800; // Total sequence (lunge, projectile, hit)
      
      // Schedule the hit parts
      setTimeout(() => setActiveAnim('projectile'), 200);
      setTimeout(() => {
        setActiveAnim('hit');
        if (ev.value && ev.value > 0) {
          const side = challengerTeam.some(c => c.id === ev.targetId) ? 'bottom' : 'top';
          const isCrit = ev.message.includes('Critical');
          const id = ++dmgIdRef.current;
          setFloatingDmg(prev => [...prev, { id, value: ev.value!, side, isCrit }]);
          setTimeout(() => setFloatingDmg(prev => prev.filter(d => d.id !== id)), 1500);
        }
      }, 400);
      setTimeout(() => setActiveAnim(null), 800);
    } else if (ev.type === 'enter_field') {
      delay = 800; // Entry animation time
    } else if (ev.type === 'defeat') {
      delay = 600; // Delay for card dying
    }

    const timer = setTimeout(() => {
      setActivePassiveMsg(null);
      setSubseqIdx(p => p + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [currentTurn, subseqIdx, playing, done, speed, log, challengerTeam]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentTurn, subseqIdx]);

  const handleSkip = () => {
    setPlaying(false);
    setCurrentTurn(log.length - 1);
    setSubseqIdx(log[log.length-1].events.length);
    setShowResults(true); // Jump straight to results
  };

  // ── RESULTS SCREEN ──
  if (showResults) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Winner announcement */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200 }}
          className="text-center"
        >
          <div className={clsx(
            'inline-block px-12 py-8 rounded-3xl border-2',
            winnerSide === 'CHALLENGER'
              ? 'bg-gradient-to-br from-yellow-500/10 to-amber-500/5 border-yellow-500/30'
              : 'bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/30'
          )}>
            {winnerSide === 'CHALLENGER'
              ? <Trophy size={64} weight="fill" className="text-yellow-400 mx-auto mb-3" />
              : <Skull size={64} weight="fill" className="text-red-400 mx-auto mb-3" />
            }
            <h2 className={clsx('text-5xl font-black', winnerSide === 'CHALLENGER' ? 'text-yellow-400' : 'text-red-400')}>
              {winnerSide === 'CHALLENGER' ? 'VICTORY!' : 'DEFEAT'}
            </h2>
            {leagueMode && leagueMode !== 'OPEN' && (
              <p className="text-xs text-slate-500 mt-2 uppercase tracking-wider">{leagueMode} League</p>
            )}
          </div>
        </motion.div>

        {/* Animated Rewards */}
        <div className="flex gap-8 justify-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3, type: 'spring' }} className="text-center">
            <motion.span animate={{ opacity: [0, 1] }} transition={{ delay: 0.5 }} className="text-yellow-400 font-black text-3xl">+{rewards.bits}</motion.span>
            <p className="text-[10px] uppercase text-slate-400 tracking-wider mt-1">Bits</p>
          </motion.div>
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5, type: 'spring' }} className="text-center">
            <motion.span animate={{ opacity: [0, 1] }} transition={{ delay: 0.7 }} className="text-blue-400 font-black text-3xl">+{rewards.xp}</motion.span>
            <p className="text-[10px] uppercase text-slate-400 tracking-wider mt-1">XP</p>
          </motion.div>
        </div>

        {/* Battle Summary by matchup */}
        {battleStats && battleStats.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between pointer-events-auto">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><ChartBar size={16} className="text-purple-400" /> Battle Summary</h3>
              <a href="/wiki#battle-system" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 z-50 relative pointer-events-auto">
                <BookOpenText size={14} weight="bold" /> Learn more in the Wiki
              </a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {battleStats.map((stat: any, i: number) => (
                <div key={i} className={clsx('rounded-xl p-3 border', stat.team === 'CHALLENGER' ? 'border-blue-500/20 bg-blue-500/5' : 'border-red-500/20 bg-red-500/5')}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white">{stat.name}</span>
                    <span className={clsx('text-[10px] uppercase tracking-wider', stat.team === 'CHALLENGER' ? 'text-blue-400' : 'text-red-400')}>{stat.team}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    <span className="text-slate-500">Damage Dealt</span><span className="text-right text-red-400 font-bold">{stat.damageDealt}</span>
                    <span className="text-slate-500">Damage Taken</span><span className="text-right text-orange-400 font-bold">{stat.damageReceived}</span>
                    <span className="text-slate-500">Passives</span><span className="text-right text-blue-400 font-bold">{stat.passivesTriggered}</span>
                    {stat.momentumAchieved && <><span className="text-slate-500">Momentum</span><span className="text-right text-orange-400 font-bold">🔥 Yes</span></>}
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
                      <h4 className="text-lg font-black text-yellow-400">Loyalty Milestone!</h4>
                      <p className="text-sm text-white font-bold">{unlock.cardName}</p>
                    </div>
                  </div>
                  {unlock.milestones.map((m, mi) => (
                    <div key={mi} className="flex items-center gap-3 bg-black/30 rounded-xl px-4 py-3 mt-2">
                      <div className="text-center">
                        <p className="text-xs text-slate-400 uppercase">New Title</p>
                        <p className="text-lg font-black text-yellow-300">{m.title}</p>
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
                            ✨ {cosmetic.replace(/_/g, ' ')}
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
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 text-center text-sm text-slate-300">
          <div className="flex items-center justify-center gap-2 text-orange-400 font-bold mb-1">
            <Star size={16} weight="fill" /> Stamina Penalty
          </div>
          <p>Your team cards lost <span className="text-red-400 font-bold">20 Stamina</span>.</p>
          <p className="text-[10px] mt-1 text-slate-500">
            <Lightning size={10} className="inline mr-1 text-yellow-500" />
            Fatigued cards (&lt;60 STA) suffer stat penalties. Go to your <a href="/collection" className="text-indigo-400 hover:text-indigo-300 underline font-bold">Collection</a> to recover!
          </p>
        </div>

        {/* Fight Again */}
        <div className="flex justify-center">
          <button
            onClick={onReset}
            className="px-10 py-4 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white rounded-2xl font-black text-lg transition-all shadow-[0_0_30px_rgba(220,38,38,0.3)] flex items-center gap-3"
          >
            <ArrowClockwise size={22} weight="bold" /> FIGHT AGAIN
          </button>
        </div>
      </div>
    );
  }

  // ── BATTLE IN PROGRESS ──
  return (
    <div className="relative min-h-[600px] w-full max-w-5xl mx-auto rounded-3xl overflow-hidden shadow-2xl bg-black border border-slate-800 isolate">
      {/* Deep Atmospheric Background */}
      <div className="absolute inset-0 pointer-events-none -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(50,55,75,0.4)_0%,rgba(10,12,20,1)_100%)]" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 mix-blend-overlay" />
        <div className="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-to-t from-blue-900/10 to-transparent" />
        <div className="absolute top-0 inset-x-0 h-1/3 bg-gradient-to-b from-red-900/10 to-transparent" />
      </div>

      {/* Passive Banner Interruption */}
      <AnimatePresence>
        {activePassiveMsg && <PassiveBanner message={activePassiveMsg} />}
      </AnimatePresence>

      {/* End State Banner (Victory/Defeat) */}
      <AnimatePresence>
        {done && !showResults && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <h2 className={clsx('text-7xl font-black drop-shadow-[0_0_20px_currentColor] mb-4', winnerSide === 'CHALLENGER' ? 'text-yellow-400' : 'text-red-500')}>
              {winnerSide === 'CHALLENGER' ? 'VICTORY' : 'DEFEAT'}
            </h2>
            <div className="text-5xl">
              {winnerSide === 'CHALLENGER' ? '🏆✨' : '💀🔥'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col h-full h-[800px] max-h-[85vh] p-4 gap-6">
        
        {/* ================= OPPONENT ZONE (TOP) ================= */}
        <div className="flex justify-between items-start z-10 sticky top-0">
          <div className="flex gap-4 items-center bg-black/40 p-2.5 rounded-2xl border border-slate-800/80 backdrop-blur-md">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center text-xl font-black text-white shadow-[0_0_15px_rgba(220,38,38,0.4)] border border-red-400">
              OPP
            </div>
            <div>
              <p className="text-sm font-bold text-red-100">Opponent</p>
              <div className="flex gap-1 mt-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className={clsx("w-3 h-3 rounded-full border", i < dScore ? "bg-red-500 border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.8)]" : "bg-slate-800 border-slate-700")} />
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex gap-1.5 -space-x-4">
            {/* Opponent bench (Face Down) */}
            {defenderTeam.map((card, i) => {
              const hp = dHpTracker[card.id] ?? card.maxHp;
              const isDefeated = hp <= 0;
              const isActive = card.id === activeDCardId;
              if (isActive) return null;
              
              return (
                <div key={card.id} className={clsx("w-14 h-20 rounded-lg border-2 shadow-lg transition-transform", isDefeated ? "hidden" : "bg-[repeating-linear-gradient(45deg,#1e293b,#1e293b_5px,#0f172a_5px,#0f172a_10px)] border-slate-700 transform hover:-translate-y-2")} style={{ zIndex: 10 - i }}>
                </div>
              );
            })}
          </div>
        </div>

        {/* ================= ACTIVE BATTLEFIELD (CENTER) ================= */}
        <div className="flex-1 flex flex-col justify-center items-center relative my-4">
          
          {/* Central Match Score / Turn indicator */}
          <div className="absolute top-1/2 left-4 -mt-6 flex flex-col items-center bg-black/50 px-4 py-2 rounded-2xl border border-slate-800/50 backdrop-blur-sm shadow-xl hidden sm:flex">
             <div className="flex gap-3 text-3xl font-black">
               <span className="text-blue-400">{cScore}</span>
               <span className="text-slate-600">-</span>
               <span className="text-red-400">{dScore}</span>
             </div>
             <p className="text-[10px] uppercase text-slate-500 tracking-widest mt-1 font-bold">Round {Math.min(currentTurn + 1, log.length)}</p>
          </div>

          <div className="relative w-full max-w-sm flex flex-col items-center justify-between h-[520px]">
            {/* Opponent Active */}
            <AnimatePresence mode="wait">
              {defenderTeam.map(card => {
                if (card.id !== activeDCardId) return null;
                const hp = dHpTracker[card.id] ?? card.maxHp;
                
                // Read next event for attack animations
                const ev = log[currentTurn]?.events[subseqIdx];
                const isAttacking = activeAnim === 'lunge' && ev?.cardId === card.id;
                const isDefending = activeAnim === 'hit' && ev?.targetId === card.id;

                return (
                  <BattleFieldCard
                    key={card.id}
                    card={card}
                    hp={hp}
                    maxHp={card.maxHp}
                    side="top"
                    defeated={hp <= 0}
                    onFire={dMomentum[card.id]}
                    isAttacking={isAttacking}
                    isDefending={isDefending}
                  />
                );
              })}
            </AnimatePresence>

            {/* Combat Projectile Area between cards */}
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

            {/* Floating Damage Numbers */}
            <AnimatePresence>
              {floatingDmg.map(d => (
                <FloatingDamage key={d.id} value={d.value} side={d.side} isCrit={d.isCrit} />
              ))}
            </AnimatePresence>

            {/* Player Active */}
            <AnimatePresence mode="wait">
              {challengerTeam.map(card => {
                if (card.id !== activeCCardId) return null;
                const hp = cHpTracker[card.id] ?? card.maxHp;
                
                const ev = log[currentTurn]?.events[subseqIdx];
                const isAttacking = activeAnim === 'lunge' && ev?.cardId === card.id;
                const isDefending = activeAnim === 'hit' && ev?.targetId === card.id;

                return (
                  <BattleFieldCard
                    key={card.id}
                    card={card}
                    hp={hp}
                    maxHp={card.maxHp}
                    side="bottom"
                    defeated={hp <= 0}
                    onFire={cMomentum[card.id]}
                    isAttacking={isAttacking}
                    isDefending={isDefending}
                  />
                );
              })}
            </AnimatePresence>
          </div>

          {/* Floating Battle Log Panel */}
          <div className={clsx(
              "absolute top-0 right-4 w-64 h-full max-h-[520px] bg-black/70 border border-slate-700/50 rounded-2xl flex flex-col shadow-2xl backdrop-blur-md transition-transform duration-300 z-30",
              isLogOpenMobile ? "translate-x-0" : "hidden sm:flex",
              "sm:translate-x-0"
            )}>
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50 rounded-t-2xl flex justify-between items-center">
              <p className="text-xs uppercase tracking-widest text-slate-400 font-bold flex items-center gap-2"><Clock size={14}/> Battle Log</p>
              <button className="sm:hidden text-slate-500" onClick={() => setIsLogOpenMobile(false)}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-slate-700">
              {log.slice(0, currentTurn + 1).map((turn, ti) =>
                turn.events.filter((_, idx) => ti < currentTurn || idx <= subseqIdx).map((ev, ei) => (
                  <motion.div
                    key={`${ti}-${ei}`}
                    initial={{ opacity: 0, x: 10, height: 0 }}
                    animate={{ opacity: 1, x: 0, height: 'auto' }}
                    className={clsx('text-xs flex flex-col p-2 rounded-lg bg-slate-800/30 border border-slate-700/30')}
                  >
                    <div className="flex items-start gap-2">
                       <span className="flex-shrink-0 text-lg leading-none">{LOG_ICONS[ev.type] || '•'}</span>
                       <span className={clsx('flex-1 leading-tight mt-0.5', LOG_COLORS[ev.type] || 'text-slate-300')}>{ev.message}</span>
                    </div>
                  </motion.div>
                ))
              )}
              <div ref={logEndRef} className="h-4" />
            </div>
          </div>
        </div>

        {/* ================= PLAYER ZONE (BOTTOM) ================= */}
        <div className="flex justify-between items-end z-10 sticky bottom-0">
          {/* Player Bench (Face Up) */}
          <div className="flex gap-2">
            {challengerTeam.map((card) => {
              const hp = cHpTracker[card.id] ?? card.maxHp;
              const isDefeated = hp <= 0;
              const isActive = card.id === activeCCardId;
              
              return (
                <div key={card.id} className={clsx("w-16 flex flex-col gap-1 transition-all", isDefeated ? "opacity-30 grayscale" : isActive ? "ring-2 ring-blue-500 rounded-lg scale-105" : "")}>
                  <div className="h-20 rounded-lg overflow-hidden border border-slate-700 relative bg-slate-800">
                     {card.avatarUrl ? <img src={card.avatarUrl} className="w-full h-full object-cover" /> : <div className="p-2"><Sword className="w-full h-full text-slate-600"/></div>}
                     {isDefeated && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Skull className="text-red-500"/></div>}
                  </div>
                  <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                    <div className={clsx('h-full rounded-full', hp > card.maxHp * 0.5 ? 'bg-green-500' : hp > card.maxHp * 0.25 ? 'bg-yellow-500' : 'bg-red-500')} style={{ width: `${Math.max(0, (hp / card.maxHp) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col items-end gap-3">
             {/* Controls Cluster */}
             <div className="flex gap-2 bg-black/60 p-1.5 rounded-xl border border-slate-800 backdrop-blur-sm">
                <button className="sm:hidden p-2 text-slate-400 hover:text-white" onClick={() => setIsLogOpenMobile(true)}>
                  <Clock size={20} />
                </button>
                <button
                  onClick={() => setPlaying(p => !p)}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors"
                  title={playing ? 'Pause' : 'Play'}
                >
                  {playing ? '⏸' : '▶'}
                </button>
                <button
                  onClick={() => setSpeed(s => s === 'normal' ? 'fast' : 'normal')}
                  className={clsx('p-2 rounded-lg transition-colors font-bold text-sm flex items-center gap-1', speed === 'fast' ? 'bg-orange-500/20 text-orange-400' : 'hover:bg-slate-800 text-slate-300')}
                  title="Toggle Speed"
                >
                  <Lightning size={16} weight={speed === 'fast' ? 'fill' : 'regular'} /> {speed === 'fast' ? '2x' : '1x'}
                </button>
                <button
                  onClick={handleSkip}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors"
                  title="Skip to End"
                >
                  <ArrowRight size={20} />
                </button>
             </div>

             {/* Player Avatar */}
             <div className="flex gap-4 items-center bg-black/40 p-2.5 rounded-2xl border border-slate-800/80 backdrop-blur-md">
                <div className="text-right">
                  <p className="text-sm font-bold text-blue-100">You</p>
                  <div className="flex gap-1 justify-end mt-1">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className={clsx("w-3 h-3 rounded-full border", i < cScore ? "bg-blue-500 border-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.8)]" : "bg-slate-800 border-slate-700")} />
                    ))}
                  </div>
                </div>
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-xl font-black text-white shadow-[0_0_15px_rgba(79,70,229,0.4)] border border-blue-400">
                  YOU
                </div>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function BattleClient({ userCards, userId, powerCap, userBits }: { userCards: TeamBuilderCard[]; userId: string; powerCap: number; userBits: number }) {
  const searchParams = useSearchParams();
  const challengeParam = searchParams.get('challenge');

  const [tab, setTab] = useState<Tab>(challengeParam ? 'Challenge' : 'Quick Battle');
  const [loading, setLoading] = useState(false);
  const [leagueMode, setLeagueMode] = useState<'OPEN'|'COMMON'|'BALANCED'|'DIVERSITY'|'LEGENDARY'>('OPEN');

  // Replay state
  const [replayData, setReplayData] = useState<{
    log: TurnLog[];
    challengerTeam: TeamCard[];
    defenderTeam: TeamCard[];
    winnerSide: 'CHALLENGER' | 'DEFENDER';
    rewards: { bits: number; xp: number };
    battleStats?: any[];
    loyaltyUnlocks?: any[];
  } | null>(null);

  // Challenge state
  const [challenges, setChallenges] = useState<{
    incoming: { id: string; challenger: { id: string; username: string; image?: string }; createdAt: string; expiresAt: string }[];
    outgoing: { id: string; defender: { id: string; username: string; image?: string } | null }[];
  }>({ incoming: [], outgoing: [] });
  const [respondingToId, setRespondingToId] = useState<string | null>(null);
  const [respondingToChallenger, setRespondingToChallenger] = useState<string>('');

  // History state
  const [history, setHistory] = useState<any[]>([]);

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

  const toTeamCard = (c: TeamBuilderCard): TeamCard => ({
    id: c.id!,
    name: c.name,
    atk: c.atk,
    def: c.def,
    hp: c.hp,
    maxHp: c.hp,
    rarity: c.rarity,
    primaryLanguage: c.primaryLanguage,
    avatarUrl: c.avatarUrl,
  });

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
        // Use challenger team from API so IDs match the battle log
        const cTeam: TeamCard[] = (data.challengerTeam || []).map((c: any) => ({
          ...c,
          maxHp: c.maxHp || c.hp,
        }));
        setReplayData({
          log: data.log,
          challengerTeam: cTeam,
          defenderTeam: (data.defenderTeam || []).map((c: any) => ({ ...c, maxHp: c.maxHp || c.hp })),
          winnerSide: data.winnerSide,
          rewards: data.rewards,
          battleStats: data.battleStats,
          loyaltyUnlocks: data.loyaltyUnlocks,
        });
      } else {
        alert(data.error);
      }
    } catch {
      alert('Battle failed to initiate.');
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
        body: JSON.stringify({ defenderUsername, cardIds, leagueMode })
      });
      const data = await res.json();
      if (data.success) {
        fetchChallenges();
        alert('Challenge sent! The opponent has 24 hours to respond.');
      } else {
        alert(data.error);
      }
    } catch {
      alert('Failed to send challenge.');
    } finally {
      setLoading(false);
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
        const dTeam = cardIds.map(id => {
          const c = userCards.find(uc => uc.id === id)!;
          return toTeamCard(c);
        });
        setReplayData({
          log: data.log,
          challengerTeam: [],
          defenderTeam: dTeam,
          winnerSide: data.winnerSide === 'DEFENDER' ? 'CHALLENGER' : 'DEFENDER',
          rewards: data.defenderRewards,
        });
        setRespondingToId(null);
        setRespondingToChallenger('');
        setTab('Quick Battle');
        fetchChallenges();
      } else {
        alert(data.error);
      }
    } catch {
      alert('Failed to respond to challenge.');
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
          rewards={replayData.rewards}
          onReset={resetBattle}
          userId={userId}
          leagueMode={leagueMode}
          battleStats={replayData.battleStats}
          loyaltyUnlocks={replayData.loyaltyUnlocks}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 mb-2 tracking-tighter">
          The Arena
        </h1>
        <p className="text-slate-400 mb-2">Assemble a team of 3. The battle resolves itself — only strategy matters.</p>
        <a href="/wiki#leagues-tournaments" className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium relative z-10">
          <BookOpenText size={16} weight="bold" /> Learn more in the Wiki
        </a>
      </div>

      {/* Tabs */}
      <div className="flex justify-center gap-2">
        {(['Quick Battle', 'Challenge', 'History'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setRespondingToId(null); }}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
              tab === t
                ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.3)]'
                : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            {t === 'Quick Battle' && <Lightning size={16} weight="fill" className="inline mr-1.5 -mt-0.5" />}
            {t === 'Challenge' && <Users size={16} weight="fill" className="inline mr-1.5 -mt-0.5" />}
            {t === 'History' && <Clock size={16} weight="fill" className="inline mr-1.5 -mt-0.5" />}
            {t}
            {t === 'Challenge' && challenges.incoming.length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {challenges.incoming.length}
              </span>
            )}
          </button>
        ))}
      </div>

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
              Create a Challenge
            </h2>
            <TeamBuilderUI
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
                Incoming Challenges
              </h2>
              {challenges.incoming.map(c => (
                <div key={c.id} className="bg-slate-900/60 border border-yellow-500/20 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-white">{c.challenger?.username || 'Unknown'} challenges you!</p>
                    <p className="text-xs text-slate-500 mt-1">Expires {new Date(c.expiresAt).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={() => {
                      setRespondingToId(c.id);
                      setRespondingToChallenger(c.challenger?.username || 'Unknown');
                    }}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-bold text-sm transition-colors"
                  >
                    Accept
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
                Sent (waiting...)
              </h2>
              {challenges.outgoing.map(c => (
                <div key={c.id} className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
                  <p className="font-bold text-white">vs {c.defender?.username || 'Unknown'}</p>
                  <p className="text-xs text-slate-400 mt-1">Awaiting response…</p>
                </div>
              ))}
            </div>
          )}

          {challenges.incoming.length === 0 && challenges.outgoing.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              <Users size={40} className="mx-auto mb-3 opacity-30" />
              <p>No pending challenges.</p>
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
            ← Back to challenges
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
            <div className="text-center py-16 text-slate-500">
              <Clock size={48} className="mx-auto mb-4 opacity-40" />
              <p>No battles yet. Start your first fight!</p>
            </div>
          ) : (
            history.map((battle: any) => {
              const isChallenger = battle.challengerId === userId;
              const didWin = battle.winnerId === userId;
              const opponentName = isChallenger
                ? (battle.defender?.username || 'Random Opponent')
                : (battle.challenger?.username || '???');

              const cTeam: TeamCard[] = (battle.challengerTeam || []).map((c: any) => ({ ...c, maxHp: c.maxHp || c.hp }));
              const dTeam: TeamCard[] = (battle.defenderTeam || []).map((c: any) => ({ ...c, maxHp: c.maxHp || c.hp }));

              return (
                <div key={battle.id} className={`bg-slate-900/60 border rounded-xl p-4 transition-all ${didWin ? 'border-green-500/20' : 'border-red-500/20'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${didWin ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="font-bold text-white">{didWin ? 'Victory' : 'Defeat'} vs {opponentName}</span>
                      {battle.isRandom && (
                        <span className="text-[10px] uppercase bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">Random</span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">
                      {new Date(battle.completedAt).toLocaleDateString()}
                    </span>
                  </div>

                  {(cTeam.length > 0 || dTeam.length > 0) && (
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                      {cTeam.length > 0 && (
                        <div>
                          <p className="text-blue-400 mb-1 uppercase tracking-wide text-[10px]">Challenger</p>
                          <div className="flex gap-1">
                            {cTeam.map(c => (
                              <div key={c.id} className="flex items-center gap-1 bg-slate-800 rounded px-1.5 py-0.5">
                                {c.avatarUrl && <img src={c.avatarUrl} className="w-4 h-4 rounded-full object-cover" alt="" />}
                                <span>{c.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {dTeam.length > 0 && (
                        <div>
                          <p className="text-red-400 mb-1 uppercase tracking-wide text-[10px]">Defender</p>
                          <div className="flex gap-1">
                            {dTeam.map(c => (
                              <div key={c.id} className="flex items-center gap-1 bg-slate-800 rounded px-1.5 py-0.5">
                                {c.avatarUrl && <img src={c.avatarUrl} className="w-4 h-4 rounded-full object-cover" alt="" />}
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
