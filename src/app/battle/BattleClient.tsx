'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardProps } from '@/components/Card';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sword, Shield, Heart, Lightning, Trophy, Clock, Users,
  GameController, ArrowClockwise, Skull, Sparkle, ArrowRight, Star
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

function HpBar({ current, max, color = 'bg-green-500' }: { current: number; max: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const barColor = pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${barColor} transition-all`}
        initial={{ width: '100%' }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
    </div>
  );
}

// Mini card for team display
function MiniCard({ card, selected, onClick, index }: { card: TeamCard; selected: boolean; onClick?: () => void; index?: number }) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      onClick={onClick}
      className={`relative cursor-pointer flex-shrink-0 rounded-xl border transition-all duration-200 bg-slate-900/80 overflow-hidden
        ${selected
          ? `ring-2 ${RARITY_GLOW[card.rarity] || 'ring-slate-500'} border-transparent shadow-[0_0_20px_rgba(168,85,247,0.3)]`
          : 'border-slate-700/50 opacity-70 hover:opacity-100'
        }
      `}
      style={{ width: 110 }}
    >
      {index !== undefined && (
        <div className="absolute top-1 left-1 z-10 bg-black/70 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-black text-white">
          {index + 1}
        </div>
      )}
      {card.avatarUrl && (
        <img src={card.avatarUrl} alt={card.name} className="w-full h-16 object-cover" />
      )}
      <div className="p-2 space-y-1">
        <p className="text-[11px] font-bold text-white truncate">{card.name}</p>
        <p className="text-[9px] text-slate-400">{card.primaryLanguage || 'Neutral'} · {card.rarity}</p>
        <div className="flex justify-between text-[9px] text-slate-400">
          <span className="text-red-400">⚔{card.atk}</span>
          <span className="text-blue-400">🛡{card.def}</span>
          <span className="text-green-400">♥{card.hp}</span>
        </div>
      </div>
    </motion.div>
  );
}

// Battle field card with HP bar
function FieldCard({ card, hp, maxHp, side, defeated }: {
  card: TeamCard; hp: number; maxHp: number; side: 'left' | 'right'; defeated?: boolean
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: side === 'left' ? -40 : 40 }}
      animate={{ opacity: defeated ? 0.3 : 1, x: 0, filter: defeated ? 'grayscale(100%)' : 'none' }}
      exit={{ opacity: 0, scale: 0.7 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center gap-2 w-36"
    >
      {card.avatarUrl && (
        <div className={`relative rounded-xl overflow-hidden border ${defeated ? 'border-red-900/50' : 'border-slate-700'}`}>
          <img src={card.avatarUrl} alt={card.name} className="w-28 h-28 object-cover" />
          {defeated && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <Skull size={32} className="text-red-500" weight="fill" />
            </div>
          )}
        </div>
      )}
      <p className="text-sm font-bold text-white text-center truncate w-full text-center">{card.name}</p>
      <HpBar current={hp} max={maxHp} />
      <p className="text-xs text-slate-400">{Math.max(0, hp)} / {maxHp} HP</p>
    </motion.div>
  );
}

// Team slots picker
function TeamSelector({
  cards,
  team,
  onToggle,
  maxSlots = 3,
}: {
  cards: CardProps[];
  team: string[];
  onToggle: (id: string) => void;
  maxSlots?: number;
}) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-3 uppercase tracking-wider">
        Tap cards to add/remove. Order matters — first card leads the battle.
        <span className="ml-2 font-bold text-white">{team.length}/3 selected</span>
      </p>
      <div className="flex gap-3 overflow-x-auto pb-4 snap-x">
        {cards.map(c => {
          const idx = team.indexOf(c.id!);
          const inTeam = idx !== -1;
          const atMax = team.length >= maxSlots;
          return (
            <div
              key={c.id}
              onClick={() => (!atMax || inTeam) && onToggle(c.id!)}
              className={`cursor-pointer snap-center flex-shrink-0 transition-all duration-200 rounded-xl
                ${inTeam ? 'ring-4 ring-orange-500 scale-105' : atMax ? 'opacity-30' : 'opacity-70 hover:opacity-100 hover:scale-105'}
              `}
            >
              {inTeam && (
                <div className="bg-orange-500 text-white text-xs font-black text-center rounded-t-xl py-0.5">
                  #{idx + 1}
                </div>
              )}
              <Card {...c} disableLink />
            </div>
          );
        })}
      </div>
      {/* Team order preview */}
      {team.length > 0 && (
        <div className="flex items-center gap-2 mt-3">
          {team.map((id, i) => {
            const card = cards.find(c => c.id === id);
            if (!card) return null;
            return (
              <div key={id} className="flex items-center gap-2">
                {i > 0 && <ArrowRight size={14} className="text-slate-600" />}
                <div className="flex items-center gap-1.5 bg-slate-800/80 rounded-lg px-2 py-1">
                  {card.avatarUrl && <img src={card.avatarUrl} className="w-5 h-5 rounded-full object-cover" alt="" />}
                  <span className="text-xs font-bold text-white">{card.name}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Animated battle replay
function BattleReplay({
  log,
  challengerTeam,
  defenderTeam,
  winnerSide,
  rewards,
  onReset,
  userId,
}: {
  log: TurnLog[];
  challengerTeam: TeamCard[];
  defenderTeam: TeamCard[];
  winnerSide: 'CHALLENGER' | 'DEFENDER';
  rewards: { bits: number; xp: number };
  onReset: () => void;
  userId: string;
}) {
  const [currentTurn, setCurrentTurn] = useState(0);
  const [playing, setPlaying] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Build per-turn HP state from the log
  const cHpByTurn = log.map(t => ({ [t.cCardId]: t.cHpEnd }));
  const dHpByTurn = log.map(t => ({ [t.dCardId]: t.dHpEnd }));

  const realTurns = log.filter(t => t.turnNumber > 0);
  const actionTurns = realTurns.filter(t => t.events.some(e => e.type !== 'battle_start' && e.type !== 'battle_end'));

  useEffect(() => {
    if (!playing) return;
    if (currentTurn >= log.length - 1) { setPlaying(false); return; }
    const timer = setTimeout(() => setCurrentTurn(p => p + 1), 1200);
    return () => clearTimeout(timer);
  }, [currentTurn, playing, log.length]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentTurn]);

  // HP tracking: walk through the log up to currentTurn
  const cHpTracker: Record<string, number> = {};
  const dHpTracker: Record<string, number> = {};
  challengerTeam.forEach(c => { cHpTracker[c.id] = c.maxHp; });
  defenderTeam.forEach(c => { dHpTracker[c.id] = c.maxHp; });

  for (let i = 0; i <= currentTurn && i < log.length; i++) {
    const t = log[i];
    if (t.cCardId) cHpTracker[t.cCardId] = t.cHpEnd;
    if (t.dCardId) dHpTracker[t.dCardId] = t.dHpEnd;
  }

  const activeCTurn = currentTurn < log.length ? log[currentTurn] : null;
  const activeCCardId = activeCTurn?.cCardId;
  const activeDCardId = activeCTurn?.dCardId;

  const done = currentTurn >= log.length - 1;

  return (
    <div className="space-y-6">
      {/* VS Header */}
      <div className="text-center">
        <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">
          BATTLE REPLAY
        </h2>
        <p className="text-slate-400 text-sm mt-1">Turn {Math.min(currentTurn + 1, log.length)} / {log.length}</p>
      </div>

      {/* Teams on field */}
      <div className="flex justify-around items-start gap-4 flex-wrap">
        {/* Challenger team */}
        <div className="flex flex-col items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Your Team</span>
          <div className="flex gap-2">
            {challengerTeam.map(card => {
              const currentHp = cHpTracker[card.id] ?? card.maxHp;
              const isActive = card.id === activeCCardId;
              const defeated = currentHp <= 0;
              return (
                <div key={card.id} className={`transition-all ${isActive ? 'scale-105' : 'scale-95 opacity-60'}`}>
                  <FieldCard card={card} hp={currentHp} maxHp={card.maxHp} side="left" defeated={defeated} />
                </div>
              );
            })}
          </div>
        </div>

        {/* VS divider */}
        <div className="flex flex-col items-center justify-center h-32">
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="text-3xl font-black text-slate-600 italic"
          >
            ⚔
          </motion.div>
        </div>

        {/* Defender team */}
        <div className="flex flex-col items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-widest text-red-400">Opponent</span>
          <div className="flex gap-2">
            {defenderTeam.map(card => {
              const currentHp = dHpTracker[card.id] ?? card.maxHp;
              const isActive = card.id === activeDCardId;
              const defeated = currentHp <= 0;
              return (
                <div key={card.id} className={`transition-all ${isActive ? 'scale-105' : 'scale-95 opacity-60'}`}>
                  <FieldCard card={card} hp={currentHp} maxHp={card.maxHp} side="right" defeated={defeated} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Controls */}
      {!done && (
        <div className="flex justify-center gap-3">
          <button
            onClick={() => setPlaying(p => !p)}
            className="px-5 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-bold text-white transition-colors"
          >
            {playing ? '⏸ Pause' : '▶ Play'}
          </button>
          <button
            onClick={() => setCurrentTurn(p => Math.min(p + 1, log.length - 1))}
            className="px-5 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-bold text-white transition-colors"
          >
            ⏭ Next
          </button>
        </div>
      )}

      {/* Live turn feed */}
      <div className="max-w-2xl mx-auto bg-black/40 border border-slate-800 rounded-2xl p-4 h-64 overflow-y-auto space-y-2">
        {log.slice(0, currentTurn + 1).map((turn, ti) =>
          turn.events.map((ev, ei) => (
            <motion.div
              key={`${ti}-${ei}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className={`text-sm flex items-start gap-2 ${EVENT_COLOR[ev.type] || 'text-slate-300'}`}
            >
              <span className="flex-shrink-0 mt-0.5">{EVENT_ICON[ev.type] || '•'}</span>
              <span>{ev.message}</span>
              {ev.value !== undefined && ev.type === 'damage' && (
                <span className="ml-auto font-black text-red-400 flex-shrink-0">-{ev.value}</span>
              )}
            </motion.div>
          ))
        )}
        <div ref={logEndRef} />
      </div>

      {/* Final result */}
      <AnimatePresence>
        {done && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring' }}
            className="text-center space-y-4"
          >
            <div className={`inline-block px-10 py-6 rounded-2xl border ${
              winnerSide === 'CHALLENGER'
                ? 'bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border-yellow-500/30'
                : 'bg-gradient-to-r from-red-500/10 to-red-600/10 border-red-500/30'
            }`}>
              {winnerSide === 'CHALLENGER'
                ? <Trophy size={56} weight="fill" className="text-yellow-400 mx-auto mb-3" />
                : <Skull size={56} weight="fill" className="text-red-400 mx-auto mb-3" />
              }
              <h2 className={`text-4xl font-black ${winnerSide === 'CHALLENGER' ? 'text-yellow-400' : 'text-red-400'}`}>
                {winnerSide === 'CHALLENGER' ? 'VICTORY!' : 'DEFEAT'}
              </h2>
              <div className="flex gap-8 mt-4 justify-center">
                <div className="text-center">
                  <span className="text-yellow-400 font-bold text-xl">+{rewards.bits}</span>
                  <p className="text-[10px] uppercase text-slate-400 tracking-wider">Bits</p>
                </div>
                <div className="text-center">
                  <span className="text-blue-400 font-bold text-xl">+{rewards.xp}</span>
                  <p className="text-[10px] uppercase text-slate-400 tracking-wider">XP</p>
                </div>
              </div>
            </div>
            <button
              onClick={onReset}
              className="px-8 py-3 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(220,38,38,0.3)] flex items-center gap-2 mx-auto"
            >
              <ArrowClockwise size={18} weight="bold" />
              FIGHT AGAIN
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function BattleClient({ userCards, userId }: { userCards: CardProps[]; userId: string }) {
  const searchParams = useSearchParams();
  const challengeParam = searchParams.get('challenge');

  const [tab, setTab] = useState<Tab>(challengeParam ? 'Challenge' : 'Quick Battle');
  const [team, setTeam] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Replay state
  const [replayData, setReplayData] = useState<{
    log: TurnLog[];
    challengerTeam: TeamCard[];
    defenderTeam: TeamCard[];
    winnerSide: 'CHALLENGER' | 'DEFENDER';
    rewards: { bits: number; xp: number };
  } | null>(null);

  // Challenge state
  const [challengeUsername, setChallengeUsername] = useState(challengeParam || '');
  const [challenges, setChallenges] = useState<{
    incoming: { id: string; challenger: { id: string; username: string; image?: string }; createdAt: string; expiresAt: string }[];
    outgoing: { id: string; defender: { id: string; username: string; image?: string } | null }[];
  }>({ incoming: [], outgoing: [] });
  const [respondingToId, setRespondingToId] = useState<string | null>(null);

  // History state
  const [history, setHistory] = useState<any[]>([]);

  const toggleCard = (id: string) => {
    setTeam(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

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

  const startRandomBattle = async () => {
    if (team.length !== 3) return;
    setLoading(true);
    setReplayData(null);
    try {
      const res = await fetch('/api/battle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardIds: team })
      });
      const data = await res.json();
      if (data.success) {
        const cTeam = team.map(id => {
          const c = userCards.find(uc => uc.id === id)!;
          return { id: c.id!, name: c.name, atk: c.atk, def: c.def, hp: c.hp, maxHp: c.hp, rarity: c.rarity, primaryLanguage: c.primaryLanguage, avatarUrl: c.avatarUrl };
        });
        setReplayData({
          log: data.log,
          challengerTeam: cTeam,
          defenderTeam: data.defenderTeam,
          winnerSide: data.winnerSide,
          rewards: data.rewards,
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

  const sendChallenge = async () => {
    if (team.length !== 3 || !challengeUsername) return;
    setLoading(true);
    try {
      const res = await fetch('/api/battle/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defenderUsername: challengeUsername, cardIds: team })
      });
      const data = await res.json();
      if (data.success) {
        setChallengeUsername('');
        setTeam([]);
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

  const respondToChallenge = async () => {
    if (!respondingToId || team.length !== 3) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/battle/challenge/${respondingToId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardIds: team })
      });
      const data = await res.json();
      if (data.success) {
        const dTeam = team.map(id => {
          const c = userCards.find(uc => uc.id === id)!;
          return { id: c.id!, name: c.name, atk: c.atk, def: c.def, hp: c.hp, maxHp: c.hp, rarity: c.rarity, primaryLanguage: c.primaryLanguage, avatarUrl: c.avatarUrl };
        });
        // The challenger team is embedded in the log, but for display we need it from the battle record. For now, show the replay from defender perspective:
        setReplayData({
          log: data.log,
          challengerTeam: [], // will be populated from backend in next iteration
          defenderTeam: dTeam,
          winnerSide: data.winnerSide === 'DEFENDER' ? 'CHALLENGER' : 'DEFENDER', // flip for current user perspective
          rewards: data.defenderRewards,
        });
        setRespondingToId(null);
        setTeam([]);
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
    setTeam([]);
  };

  if (userCards.length < 3) {
    return (
      <div className="text-center py-20 text-slate-400">
        <GameController size={64} className="mx-auto mb-4 opacity-50" />
        <p className="text-xl">You need at least 3 cards to battle.</p>
        <p className="text-sm mt-2">Go to the Gacha and open boosters!</p>
      </div>
    );
  }

  // Convert CardProps to TeamCard format
  const toTeamCard = (c: CardProps): TeamCard => ({
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

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 mb-2 tracking-tighter">
          The Arena
        </h1>
        <p className="text-slate-400">Assemble a team of 3. The battle resolves itself — only strategy matters.</p>
      </div>

      {/* Tabs */}
      {!replayData && (
        <div className="flex justify-center gap-2">
          {(['Quick Battle', 'Challenge', 'History'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); }}
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
      )}

      {/* Replay */}
      {replayData && (
        <BattleReplay
          log={replayData.log}
          challengerTeam={replayData.challengerTeam}
          defenderTeam={replayData.defenderTeam}
          winnerSide={replayData.winnerSide}
          rewards={replayData.rewards}
          onReset={resetBattle}
          userId={userId}
        />
      )}

      {/* Tab Content */}
      {!replayData && (
        <>
          {/* QUICK BATTLE */}
          {tab === 'Quick Battle' && (
            <div className="space-y-6">
              {/* Type Info Panel */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 grid grid-cols-2 md:grid-cols-3 gap-2">
                <div className="flex items-center gap-1.5"><Star size={12} className="text-yellow-400" /> <span><b className="text-white">Python</b> beats JS</span></div>
                <div className="flex items-center gap-1.5"><Star size={12} className="text-yellow-400" /> <span><b className="text-white">JS</b> beats Ruby</span></div>
                <div className="flex items-center gap-1.5"><Star size={12} className="text-yellow-400" /> <span><b className="text-white">Ruby</b> beats PHP</span></div>
                <div className="flex items-center gap-1.5"><Star size={12} className="text-yellow-400" /> <span><b className="text-white">Rust</b> beats C/C++</span></div>
                <div className="flex items-center gap-1.5"><Star size={12} className="text-yellow-400" /> <span><b className="text-white">Go</b> beats Rust</span></div>
                <div className="flex items-center gap-1.5"><Star size={12} className="text-yellow-400" /> <span><b className="text-white">CSS</b>: chaotic wildcard</span></div>
              </div>

              <TeamSelector cards={userCards} team={team} onToggle={toggleCard} />

              <div className="flex justify-center">
                <button
                  onClick={startRandomBattle}
                  disabled={team.length !== 3 || loading}
                  className="px-12 py-4 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-bold text-xl rounded-2xl disabled:opacity-50 transition-all shadow-[0_0_25px_rgba(220,38,38,0.4)] flex items-center gap-3"
                >
                  <Lightning size={24} weight="fill" />
                  {loading ? 'Matchmaking...' : team.length === 3 ? 'BATTLE!' : `Select ${3 - team.length} more card${3 - team.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          )}

          {/* CHALLENGE TAB */}
          {tab === 'Challenge' && !respondingToId && (
            <div className="space-y-10">
              {/* Create Challenge */}
              <div className="max-w-2xl mx-auto bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Sword size={22} className="text-red-400" />
                  Challenge a Friend
                </h2>
                <div>
                  <label className="text-xs uppercase tracking-wider text-slate-400 block mb-2">Opponent&apos;s Username</label>
                  <input
                    type="text"
                    value={challengeUsername}
                    onChange={e => setChallengeUsername(e.target.value)}
                    placeholder="Enter username..."
                    className="w-full bg-black/40 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-red-500/50 transition-colors"
                  />
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-2 uppercase tracking-wider">Your Team (select 3 cards in battle order)</p>
                  <TeamSelector cards={userCards} team={team} onToggle={toggleCard} />
                </div>
                <button
                  onClick={sendChallenge}
                  disabled={team.length !== 3 || !challengeUsername || loading}
                  className="w-full py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white rounded-xl font-bold disabled:opacity-50 transition-all"
                >
                  {loading ? 'Sending...' : 'Send Challenge'}
                </button>
                <p className="text-xs text-slate-500 text-center">
                  Your team will not be visible to the opponent until they accept.
                </p>
              </div>

              {/* Incoming Challenges */}
              {challenges.incoming.length > 0 && (
                <div className="max-w-2xl mx-auto space-y-4">
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
                        onClick={() => { setRespondingToId(c.id); setTeam([]); }}
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
                <div className="max-w-2xl mx-auto space-y-4">
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
                  <p>No pending challenges. Send one above!</p>
                </div>
              )}
            </div>
          )}

          {/* Respond to challenge */}
          {tab === 'Challenge' && respondingToId && (
            <div className="max-w-2xl mx-auto bg-slate-900/60 border border-yellow-500/20 rounded-2xl p-6 space-y-6">
              <h2 className="text-xl font-bold text-white">Accept Challenge</h2>
              <p className="text-sm text-slate-400">Select your 3-card team. The battle will resolve automatically once you confirm.</p>
              <TeamSelector cards={userCards} team={team} onToggle={toggleCard} />
              <div className="flex gap-3">
                <button
                  onClick={() => { setRespondingToId(null); setTeam([]); }}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={respondToChallenge}
                  disabled={team.length !== 3 || loading}
                  className="flex-1 py-3 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white rounded-xl font-bold disabled:opacity-50 transition-all"
                >
                  {loading ? 'Fighting...' : 'Accept & Fight'}
                </button>
              </div>
            </div>
          )}

          {/* HISTORY TAB */}
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
                  const didWin = battle.winnerId === userId || (battle.isRandom && battle.winnerId !== '__SYSTEM__' && battle.winnerId === userId);
                  const opponentName = isChallenger
                    ? (battle.defender?.username || 'Random Opponent')
                    : (battle.challenger?.username || '???');

                  // Parse the teams from JSON
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

                      {/* Team mini display */}
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
        </>
      )}
    </div>
  );
}
