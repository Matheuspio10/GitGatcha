'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardProps } from '@/components/Card';
import TeamBuilderUI, { TeamBuilderCard } from '@/components/TeamBuilderUI';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import {
  Sword, Shield, Heart, Lightning, Trophy, Clock, Users,
  GameController, ArrowClockwise, Skull, Sparkle, ArrowRight, Star, ChartBar
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

function FloatingDamage({ value, x }: { value: number; x: 'left' | 'right' }) {
  const fontSize = Math.min(36, 16 + Math.floor(value / 100) * 4);
  return (
    <motion.div
      initial={{ opacity: 1, y: 0, scale: 1 }}
      animate={{ opacity: 0, y: -60, scale: 1.3 }}
      transition={{ duration: 0.9, ease: 'easeOut' }}
      className={clsx('absolute z-30 font-black text-red-400 pointer-events-none', x === 'left' ? 'left-1/2' : 'right-1/2')}
      style={{ fontSize, top: '30%' }}
    >
      -{value}
    </motion.div>
  );
}

// Active Card on battlefield
function BattleFieldCard({ card, hp, maxHp, side, defeated, onFire }: {
  card: TeamCard; hp: number; maxHp: number; side: 'left' | 'right'; defeated?: boolean; onFire?: number;
}) {
  const lowHp = hp > 0 && hp < maxHp * 0.25;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: side === 'left' ? -60 : 60, scale: 0.8 }}
      animate={{
        opacity: defeated ? 0.2 : 1,
        x: 0,
        scale: defeated ? 0.85 : 1,
        filter: defeated ? 'grayscale(100%)' : 'none',
      }}
      exit={{ opacity: 0, scale: 0.5, rotateY: 90 }}
      transition={{ type: 'spring', stiffness: 250, damping: 25 }}
      className={clsx(
        'relative flex flex-col items-center gap-2 w-40',
        lowHp && !defeated && 'animate-pulse',
      )}
    >
      {/* On Fire badge */}
      {onFire && onFire > 0 && !defeated && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ repeat: Infinity, duration: 1.2 }}
          className="absolute -top-3 z-20 bg-gradient-to-r from-orange-500 to-red-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-lg"
        >
          🔥 On Fire! +{onFire * 10}%
        </motion.div>
      )}

      {/* Card avatar */}
      <div className={clsx(
        'relative rounded-xl overflow-hidden border-2 w-32 h-32',
        defeated ? 'border-red-900/30' : lowHp ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)]' : 'border-slate-600',
        onFire && onFire > 0 && !defeated && 'shadow-[0_0_25px_rgba(249,115,22,0.6)] border-orange-500',
      )}>
        {card.avatarUrl && (
          <img src={card.avatarUrl} alt={card.name} className="w-full h-full object-cover" />
        )}
        {defeated && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 bg-black/70 flex items-center justify-center"
          >
            <Skull size={40} className="text-red-500" weight="fill" />
          </motion.div>
        )}
      </div>

      {/* Name & Language */}
      <div className="text-center w-full">
        <p className="text-sm font-bold text-white truncate">{card.name}</p>
        {card.primaryLanguage && (
          <span className="text-[10px] bg-slate-800 text-slate-400 rounded px-1.5 py-0.5">{card.primaryLanguage}</span>
        )}
      </div>

      {/* Stat Bars */}
      <div className="w-full space-y-1 px-1">
        <StatBar label="HP" current={hp} max={maxHp} color="" large />
        <StatBar label="ATK" current={card.atk} max={card.atk} color="bg-red-500" />
        <StatBar label="DEF" current={card.def} max={card.def} color="bg-blue-500" />
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
  const [floatingDmg, setFloatingDmg] = useState<{ id: number; value: number; side: 'left' | 'right' }[]>([]);
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

  // Auto-play
  useEffect(() => {
    if (!playing) return;
    if (currentTurn >= log.length - 1) { setPlaying(false); return; }
    const timer = setTimeout(() => {
      setCurrentTurn(p => p + 1);
      // floating damage
      const nextTurn = log[currentTurn + 1];
      if (nextTurn) {
        nextTurn.events.forEach(ev => {
          if (ev.type === 'damage' && ev.value && ev.value > 0) {
            const side = challengerTeam.some(c => c.id === ev.targetId) ? 'left' : 'right';
            const id = ++dmgIdRef.current;
            setFloatingDmg(prev => [...prev, { id, value: ev.value!, side }]);
            setTimeout(() => setFloatingDmg(prev => prev.filter(d => d.id !== id)), 1000);
          }
        });
      }
    }, interval);
    return () => clearTimeout(timer);
  }, [currentTurn, playing, log.length, interval]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentTurn]);

  const handleSkip = () => {
    setPlaying(false);
    setCurrentTurn(log.length - 1);
  };

  // ── RESULTS SCREEN ──
  if (done) {
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
            <h3 className="text-sm font-bold text-white flex items-center gap-2"><ChartBar size={16} className="text-purple-400" /> Battle Summary</h3>
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
                        {m.cosmetics.filter(c => !c.includes('badge')).map((cosmetic, ci) => (
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
    <div className="space-y-4">
      {/* Top: Score Bar */}
      <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800 rounded-2xl px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-xs font-black text-white">YOU</div>
          <span className="text-2xl font-black text-white">{cScore}</span>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest text-slate-600">Turn {Math.min(currentTurn + 1, log.length)} / {log.length}</p>
          <p className="text-lg font-black text-slate-500">VS</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-black text-white">{dScore}</span>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-xs font-black text-white">OPP</div>
        </div>
      </div>

      {/* Main Battle Area — Split Screen */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start min-h-[380px]">
        {/* Player side */}
        <div className="flex flex-col items-center relative">
          <span className="text-[10px] uppercase tracking-widest text-blue-400 font-bold mb-2">YOUR CARD</span>
          <AnimatePresence mode="wait">
            {challengerTeam.map(card => {
              if (card.id !== activeCCardId) return null;
              const hp = cHpTracker[card.id] ?? card.maxHp;
              return (
                <BattleFieldCard
                  key={card.id}
                  card={card}
                  hp={hp}
                  maxHp={card.maxHp}
                  side="left"
                  defeated={hp <= 0}
                  onFire={cMomentum[card.id]}
                />
              );
            })}
          </AnimatePresence>
          {/* Floating damage on player side */}
          <AnimatePresence>
            {floatingDmg.filter(d => d.side === 'left').map(d => (
              <FloatingDamage key={d.id} value={d.value} x="left" />
            ))}
          </AnimatePresence>
        </div>

        {/* Center: Battle Log */}
        <div className="w-64 lg:w-80 bg-black/50 border border-slate-800 rounded-2xl overflow-hidden flex flex-col" style={{ maxHeight: 380 }}>
          <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/80">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 text-center">Battle Log</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {log.slice(0, currentTurn + 1).map((turn, ti) =>
              turn.events.slice(-5).map((ev, ei) => (
                <motion.div
                  key={`${ti}-${ei}`}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={clsx('text-[11px] flex items-start gap-1.5 leading-tight', LOG_COLORS[ev.type] || 'text-slate-300')}
                >
                  <span className="flex-shrink-0 mt-0.5 text-[10px]">{LOG_ICONS[ev.type] || '•'}</span>
                  <span>{ev.message}</span>
                  {ev.value !== undefined && ev.type === 'damage' && (
                    <span className="ml-auto font-black text-red-400 flex-shrink-0">-{ev.value}</span>
                  )}
                </motion.div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* Opponent side */}
        <div className="flex flex-col items-center relative">
          <span className="text-[10px] uppercase tracking-widest text-red-400 font-bold mb-2">OPPONENT</span>
          <AnimatePresence mode="wait">
            {defenderTeam.map(card => {
              if (card.id !== activeDCardId) return null;
              const hp = dHpTracker[card.id] ?? card.maxHp;
              return (
                <BattleFieldCard
                  key={card.id}
                  card={card}
                  hp={hp}
                  maxHp={card.maxHp}
                  side="right"
                  defeated={hp <= 0}
                  onFire={dMomentum[card.id]}
                />
              );
            })}
          </AnimatePresence>
          <AnimatePresence>
            {floatingDmg.filter(d => d.side === 'right').map(d => (
              <FloatingDamage key={d.id} value={d.value} x="right" />
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Speed Controls */}
      <div className="flex justify-center gap-3">
        <button
          onClick={() => setPlaying(p => !p)}
          className="px-5 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-bold text-white transition-colors"
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <button
          onClick={() => setSpeed(s => s === 'normal' ? 'fast' : 'normal')}
          className={clsx('px-5 py-2 rounded-xl text-sm font-bold transition-colors', speed === 'fast' ? 'bg-orange-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white')}
        >
          {speed === 'fast' ? '🐇 Fast' : '🐢 Normal'}
        </button>
        <button
          onClick={handleSkip}
          className="px-5 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-bold text-white transition-colors flex items-center gap-1.5"
        >
          <ArrowRight size={16} weight="bold" /> Skip
        </button>
      </div>

      {/* Bottom: Team Roster */}
      <div className="grid grid-cols-2 gap-4">
        {/* Player team */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3">
          <p className="text-[9px] uppercase tracking-widest text-blue-400 mb-2">Your Team</p>
          <div className="flex gap-2">
            {challengerTeam.map(card => {
              const hp = cHpTracker[card.id] ?? card.maxHp;
              const isDefeated = hp <= 0;
              const isActive = card.id === activeCCardId;
              return (
                <div key={card.id} className={clsx('flex-1 text-center', isDefeated && 'grayscale opacity-40')}>
                  <div className={clsx('relative rounded-lg overflow-hidden border', isActive ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-slate-700')}>
                    {card.avatarUrl && <img src={card.avatarUrl} alt={card.name} className="w-full h-12 object-cover" />}
                    {isDefeated && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Skull size={16} className="text-red-500" weight="fill" />
                      </div>
                    )}
                  </div>
                  <p className="text-[9px] text-white font-bold mt-1 truncate">{card.name}</p>
                  <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mt-0.5">
                    <div className={clsx('h-full rounded-full', hp > card.maxHp * 0.5 ? 'bg-green-500' : hp > card.maxHp * 0.25 ? 'bg-yellow-500' : 'bg-red-500')} style={{ width: `${Math.max(0, (hp / card.maxHp) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Opponent team */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3">
          <p className="text-[9px] uppercase tracking-widest text-red-400 mb-2">Opponent</p>
          <div className="flex gap-2">
            {defenderTeam.map(card => {
              const hp = dHpTracker[card.id] ?? card.maxHp;
              const isDefeated = hp <= 0;
              const isActive = card.id === activeDCardId;
              return (
                <div key={card.id} className={clsx('flex-1 text-center', isDefeated && 'grayscale opacity-40')}>
                  <div className={clsx('relative rounded-lg overflow-hidden border', isActive ? 'border-red-500 ring-2 ring-red-500/30' : 'border-slate-700')}>
                    {card.avatarUrl && <img src={card.avatarUrl} alt={card.name} className="w-full h-12 object-cover" />}
                    {isDefeated && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Skull size={16} className="text-red-500" weight="fill" />
                      </div>
                    )}
                  </div>
                  <p className="text-[9px] text-white font-bold mt-1 truncate">{card.name}</p>
                  <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mt-0.5">
                    <div className={clsx('h-full rounded-full', hp > card.maxHp * 0.5 ? 'bg-green-500' : hp > card.maxHp * 0.25 ? 'bg-yellow-500' : 'bg-red-500')} style={{ width: `${Math.max(0, (hp / card.maxHp) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

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
        <p className="text-slate-400">Assemble a team of 3. The battle resolves itself — only strategy matters.</p>
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
