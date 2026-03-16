'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  Sword, Shield, Heart, Lightning, Users, Star, Funnel,
  X, CheckCircle, ArrowsVertical, GameController, MagnifyingGlass,
  ChartBar, Info, ArrowRight, WarningCircle, SortAscending, Lock, Crown, BookOpenText
} from '@phosphor-icons/react';
import { CardProps } from '@/components/Card';
import clsx from 'clsx';
import { calculateCurrentStamina, getStaminaMultiplier } from '@/lib/staminaUtils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TeamBuilderCard extends CardProps {
  pack?: string;
  loyaltyTier?: string;
  loyaltyCount?: number;
}

export type LeagueMode = 'OPEN' | 'COMMON' | 'BALANCED' | 'DIVERSITY' | 'LEGENDARY';

export const LEAGUE_CONFIG: Record<LeagueMode, { label: string; icon: string; color: string; border: string; bg: string; description: string; winBits: number; winXp: number; entryFee?: number }> = {
  OPEN: { label: 'Open League', icon: '⚔️', color: 'text-slate-300', border: 'border-slate-500', bg: 'bg-slate-500/10', description: 'No restrictions — use any cards.', winBits: 50, winXp: 80 },
  COMMON: { label: 'Common League', icon: '🛡️', color: 'text-green-400', border: 'border-green-500', bg: 'bg-green-500/10', description: 'Common & Uncommon cards only.', winBits: 80, winXp: 100 },
  BALANCED: { label: 'Balanced League', icon: '⚖️', color: 'text-blue-400', border: 'border-blue-500', bg: 'bg-blue-500/10', description: 'Team power cannot exceed the cap.', winBits: 100, winXp: 120 },
  DIVERSITY: { label: 'Diversity League', icon: '🌍', color: 'text-purple-400', border: 'border-purple-500', bg: 'bg-purple-500/10', description: '3 different primary languages required.', winBits: 120, winXp: 140 },
  LEGENDARY: { label: 'Legendary Only', icon: '👑', color: 'text-yellow-400', border: 'border-yellow-500', bg: 'bg-yellow-500/10', description: 'Legendary cards only. 500 BITS entry.', winBits: 300, winXp: 200, entryFee: 500 },
};

interface TeamBuilderProps {
  userCards: TeamBuilderCard[];
  challengeUsername?: string;
  onSubmitRandom: (cardIds: string[]) => void;
  onSubmitChallenge: (cardIds: string[], defenderUsername: string) => void;
  loading?: boolean;
  mode: 'quick' | 'challenge' | 'respond';
  respondingToChallenger?: string;
  onRespond?: (cardIds: string[]) => void;
  leagueMode?: LeagueMode;
  setLeagueMode?: (mode: LeagueMode) => void;
  powerCap?: number;
  userBits?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

const RARITY_COLOR: Record<string, string> = {
  Common: 'border-slate-400 text-slate-300',
  Uncommon: 'border-green-400 text-green-300',
  Rare: 'border-blue-500 text-blue-300',
  Epic: 'border-purple-500 text-purple-300',
  Legendary: 'border-yellow-400 text-yellow-300',
};

const RARITY_GLOW: Record<string, string> = {
  Common: 'shadow-slate-500/40',
  Uncommon: 'shadow-green-500/40',
  Rare: 'shadow-blue-500/50',
  Epic: 'shadow-purple-500/60',
  Legendary: 'shadow-yellow-400/70',
};

const RARITY_BG: Record<string, string> = {
  Common: 'bg-slate-500/20',
  Uncommon: 'bg-green-500/20',
  Rare: 'bg-blue-500/20',
  Epic: 'bg-purple-500/20',
  Legendary: 'bg-yellow-400/20',
};

const LANG_COLOR: Record<string, string> = {
  JavaScript: 'text-yellow-400',
  TypeScript: 'text-blue-400',
  Python: 'text-cyan-400',
  Java: 'text-orange-400',
  Rust: 'text-orange-500',
  Go: 'text-cyan-300',
  Ruby: 'text-red-400',
  'C': 'text-gray-400',
  'C++': 'text-indigo-400',
  'C#': 'text-purple-400',
  PHP: 'text-indigo-300',
  HTML: 'text-orange-500',
  CSS: 'text-blue-500',
  Unknown: 'text-slate-400',
};

const TYPE_ADVANTAGES: Record<string, string[]> = {
  Python: ['JavaScript'],
  JavaScript: ['Ruby'],
  Ruby: ['PHP'],
  PHP: ['Python'],
  Rust: ['C', 'C++'],
  C: ['Go'],
  'C++': ['Go'],
  Go: ['Rust'],
  TypeScript: ['JavaScript'],
};

const SLOT_LABELS = ['Opener', 'Mid', 'Closer'];
const SLOT_DESCRIPTIONS = [
  'Leads the battle — sets the pace',
  'Mid-game fighter — bridges the team',
  'The finisher — closes strong',
];
const SLOT_ICONS = ['🥊', '⚔️', '🏆'];

// ─── Synergy Computation ─────────────────────────────────────────────────────

interface SynergyInfo {
  label: string;
  description: string;
  color: string;
  icon: string;
  active: boolean;
}

function computeSynergies(cards: (TeamBuilderCard | null)[]): SynergyInfo[] {
  const filled = cards.filter(Boolean) as TeamBuilderCard[];
  if (filled.length === 0) return [];

  const results: SynergyInfo[] = [];
  const typeCounts: Record<string, number> = {};
  filled.forEach(c => {
    const t = c.primaryLanguage || 'Unknown';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });

  const uniqueCount = Object.keys(typeCounts).length;

  const CORE_LANGUAGES = ['JavaScript', 'TypeScript', 'Python', 'Rust', 'Go', 'Ruby', 'C', 'C++', 'CSS', 'PHP'];

  // Pair/Triple synergies
  Object.keys(typeCounts).forEach(type => {
    const count = typeCounts[type];
    if (count >= 2 && CORE_LANGUAGES.includes(type)) {
      const mult = count === 3 ? 2 : 1;
      if (type === 'Python') {
        results.push({
          label: `${count}× Python`,
          description: `All cards regenerate ${(3 * mult)}% HP per turn`,
          color: 'text-cyan-400',
          icon: '🐍',
          active: true,
        });
      } else if (type === 'JavaScript') {
        results.push({
          label: `${count}× JavaScript`,
          description: `${(10 * mult)}% chance of double callback damage`,
          color: 'text-yellow-400',
          icon: '⚡',
          active: true,
        });
      } else if (type === 'Rust') {
        results.push({
          label: `${count}× Rust`,
          description: `All cards take ${(10 * mult)}% less damage`,
          color: 'text-orange-400',
          icon: '🛡️',
          active: true,
        });
      } else if (type === 'Go') {
        results.push({
          label: `${count}× Go`,
          description: `All Go cards gain First Strike on entry`,
          color: 'text-cyan-300',
          icon: '⚡',
          active: true,
        });
      } else {
        results.push({
          label: `${count}× ${type}`,
          description: `${type} team synergy active`,
          color: 'text-purple-400',
          icon: '✨',
          active: true,
        });
      }
    }
  });

  // Mixed team bonus when all 3 filled and all unique
  if (filled.length === 3 && uniqueCount === 3) {
    results.push({
      label: 'Mixed Team',
      description: '+8% ATK for all cards',
      color: 'text-emerald-400',
      icon: '🌈',
      active: true,
    });
  }

  // No synergy (partial team - informative)
  if (results.length === 0 && filled.length < 3) {
    results.push({
      label: 'No synergy yet',
      description: 'Add more cards to activate synergies',
      color: 'text-slate-500',
      icon: '—',
      active: false,
    });
  }

  // Default mixed team info when 3 cards but no pair
  if (results.length === 0 && filled.length === 3 && uniqueCount < 3) {
    // This covers pairs not matching above (e.g. Java)
    results.push({
      label: 'No synergy',
      description: 'Mixed team: +8% ATK for all cards',
      color: 'text-slate-400',
      icon: '⚔️',
      active: true,
    });
  }

  return results;
}

// ─── Mini Compact Card (for grid) ────────────────────────────────────────────

function CompactCard({
  card,
  placed,
  slotIndex,
  dimmed,
  onClick,
}: {
  card: TeamBuilderCard;
  placed: boolean;
  slotIndex?: number;
  dimmed?: boolean;
  onClick: () => void;
}) {
  const border = RARITY_COLOR[card.rarity] || RARITY_COLOR.Common;
  const langColor = LANG_COLOR[card.primaryLanguage || 'Unknown'] || LANG_COLOR.Unknown;
  const glow = RARITY_GLOW[card.rarity] || '';

  const currentStamina = card.stamina !== undefined ? calculateCurrentStamina(card.stamina, card.lastUsedAt ? new Date(card.lastUsedAt) : new Date(), card.inActiveTeam || false) : 100;
  const multiplier = getStaminaMultiplier(currentStamina);
  
  const displayAtk = Math.floor(card.atk * multiplier);
  const displayDef = Math.floor(card.def * multiplier);

  return (
    <motion.button
      onClick={onClick}
      whileHover={!placed ? { scale: 1.02, y: -2 } : {}}
      whileTap={!placed ? { scale: 0.97 } : {}}
      className={clsx(
        'relative flex items-center gap-3 w-full rounded-xl border-2 px-3 py-2.5 text-left transition-all duration-200',
        'bg-slate-900/80 backdrop-blur-sm',
        border,
        placed
          ? 'opacity-40 cursor-default'
          : currentStamina === 0
          ? 'opacity-50 cursor-not-allowed border-red-900/50'
          : `cursor-pointer hover:shadow-lg ${glow} hover:shadow-current`,
        dimmed && 'grayscale',
      )}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <img
          src={card.avatarUrl}
          alt={card.name}
          className="w-11 h-11 rounded-lg object-cover ring-1 ring-white/10"
        />
        {placed && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
            <CheckCircle size={20} weight="fill" className="text-green-400" />
          </div>
        )}
        {placed && slotIndex !== undefined && (
          <div className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-[10px] font-black text-white border border-orange-300">
            {slotIndex + 1}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-bold text-white truncate">{card.name}</p>
          {card.loyaltyTier && card.loyaltyTier !== 'none' && (
            <span className="text-xs flex-shrink-0" title={card.loyaltyTier.replace('_', ' ')}>
              {card.loyaltyTier === 'veteran' ? '⭐' : card.loyaltyTier === 'trusted' ? '🛡️' : card.loyaltyTier === 'reliable' ? '🔥' : card.loyaltyTier === 'legendary_bond' ? '💎' : card.loyaltyTier === 'eternal' ? '♾️' : ''}
            </span>
          )}
        </div>
        <p className={clsx('text-xs font-medium', langColor)}>
          {card.primaryLanguage || 'Unknown'} · <span className="text-slate-400">{card.rarity}</span>
        </p>
        <div className="flex items-center gap-2.5 mt-1">
          <span className={clsx("text-xs flex items-center gap-0.5", multiplier < 1 ? "text-red-500 font-bold" : "text-red-400")}>
            <Sword size={10} weight="fill" /> {displayAtk}
          </span>
          <span className={clsx("text-xs flex items-center gap-0.5", multiplier < 1 ? "text-blue-500 font-bold" : "text-blue-400")}>
            <Shield size={10} weight="fill" /> {displayDef}
          </span>
          <span className="text-xs text-green-400 flex items-center gap-0.5">
            <Heart size={10} weight="fill" /> {card.hp}
          </span>
        </div>
      </div>

      {/* Power score */}
      <div className="flex-shrink-0 text-right w-12 flex flex-col items-end justify-center">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider">PWR</p>
        <p className={clsx("text-sm font-black leading-tight", multiplier < 1 ? "text-yellow-400" : "text-white")}>{displayAtk + displayDef + card.hp}</p>
        
        {/* Stamina line */}
        <div className="w-full mt-2 h-[4px] bg-slate-800 rounded-full overflow-hidden shadow-inner flex" title={`Stamina: ${currentStamina}/100`}>
          <div 
            className={clsx("h-full transition-all duration-500", currentStamina < 40 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : currentStamina < 80 ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]' : 'bg-green-500')}
            style={{ width: `${Math.max(0, Math.min(100, currentStamina))}%` }}
          />
        </div>
        {currentStamina < 60 && (
          <p className={clsx("text-[8px] mt-1 font-bold uppercase", currentStamina === 0 ? "text-red-500 animate-pulse" : "text-yellow-500")}>
            {currentStamina === 0 ? "Exhaust" : "Fatigue"}
          </p>
        )}
        {(() => {
          const count = card.loyaltyCount || 0;
          const thresholds = [10, 25, 50, 100, 200];
          const tierNames = ['Veteran', 'Trusted', 'Reliable', 'L.Bond', 'Eternal'];
          for (let i = 0; i < thresholds.length; i++) {
            if (count < thresholds[i] && thresholds[i] - count <= 5) {
              return (
                <p className="text-[7px] mt-0.5 font-bold text-amber-400 animate-pulse truncate">
                  ~{tierNames[i]}!
                </p>
              );
            }
          }
          return null;
        })()}
      </div>
    </motion.button>
  );
}

// ─── Team Slot ────────────────────────────────────────────────────────────────

function TeamSlot({
  index,
  card,
  onRemove,
  isActive,
}: {
  index: number;
  card: TeamBuilderCard | null;
  onRemove: () => void;
  isActive?: boolean;
}) {
  const border = card ? (RARITY_COLOR[card.rarity] || RARITY_COLOR.Common) : 'border-slate-700';
  const glow = card ? (RARITY_GLOW[card.rarity] || '') : '';
  const langColor = card ? (LANG_COLOR[card.primaryLanguage || 'Unknown'] || LANG_COLOR.Unknown) : '';

  const currentStamina = card && card.stamina !== undefined ? calculateCurrentStamina(card.stamina, card.lastUsedAt ? new Date(card.lastUsedAt) : new Date(), card.inActiveTeam || false) : 100;
  const multiplier = getStaminaMultiplier(currentStamina);
  
  const displayAtk = Math.floor((card?.atk || 0) * multiplier);
  const displayDef = Math.floor((card?.def || 0) * multiplier);

  return (
    <motion.div
      layout
      className={clsx(
        'relative rounded-2xl border-2 overflow-hidden flex flex-col transition-all duration-300',
        'w-full max-w-[200px] mx-auto',
        multiplier < 1 ? (currentStamina === 0 ? "border-red-900 bg-red-950/20" : "border-yellow-600 bg-yellow-950/20") : (card ? border : 'border-dashed border-slate-700'),
        card ? `shadow-lg ${glow}` : '',
        isActive && 'ring-2 ring-orange-500/60',
        multiplier < 1 && (currentStamina === 0 ? 'shadow-[0_0_15px_rgba(153,27,27,0.4)]' : 'shadow-[0_0_15px_rgba(202,138,4,0.3)]'),
        currentStamina === 0 && 'opacity-70 grayscale-[30%]'
      )}
      style={{ minHeight: 220 }}
    >
      {/* Slot number badge */}
      <div className="absolute top-2 left-2 z-20 bg-black/70 backdrop-blur-sm rounded-full w-7 h-7 flex items-center justify-center text-xs font-black text-white border border-white/10">
        {index + 1}
      </div>

      {/* Remove button (when filled) */}
      {card && (
        <motion.button
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={onRemove}
          className="absolute top-2 right-2 z-20 bg-red-600/80 hover:bg-red-500 rounded-full w-6 h-6 flex items-center justify-center text-white transition-colors backdrop-blur-sm"
        >
          <X size={12} weight="bold" />
        </motion.button>
      )}

      <AnimatePresence mode="wait">
        {card ? (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, scale: 0.85, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: -10 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            className="flex flex-col h-full bg-slate-900"
          >
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

            {/* Custom Stamina Display on active Team Slot */}
            <div className="absolute top-2 left-10 z-20">
              {currentStamina < 60 && (
                <div className={clsx("backdrop-blur-sm text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border", currentStamina === 0 ? "bg-red-500/30 border-red-500/50 text-red-300 animate-pulse" : "bg-yellow-500/30 border-yellow-500/50 text-yellow-300")}>
                  <WarningCircle size={10} weight="bold" /> {currentStamina === 0 ? 'Exhausted' : 'Fatigued'}
                </div>
              )}
            </div>

            {/* Avatar */}
            <div className="relative w-full h-28 bg-black overflow-hidden">
              <img src={card.avatarUrl} alt={card.name} className="w-full h-full object-cover opacity-90" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
            </div>

            {/* Info */}
            <div className="relative flex-1 p-3 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-sm text-white leading-tight truncate">{card.name}</p>
                {card.loyaltyTier && card.loyaltyTier !== 'none' && (
                  <span className="text-sm flex-shrink-0">
                    {card.loyaltyTier === 'veteran' ? '⭐' : card.loyaltyTier === 'trusted' ? '🛡️' : card.loyaltyTier === 'reliable' ? '🔥' : card.loyaltyTier === 'legendary_bond' ? '💎' : card.loyaltyTier === 'eternal' ? '♾️' : ''}
                  </span>
                )}
              </div>
              <p className={clsx('text-xs font-semibold', langColor)}>
                {card.primaryLanguage || 'Unknown'}
              </p>
              <div className="grid grid-cols-3 gap-1 mt-auto pt-2 border-t border-white/10 text-center">
                <div>
                  <p className="text-[9px] text-slate-500 uppercase">ATK</p>
                  <p className={clsx("text-xs font-black", multiplier < 1 ? "text-yellow-400" : "text-red-400")}>{displayAtk}</p>
                </div>
                <div className="border-x border-white/10">
                  <p className="text-[9px] text-slate-500 uppercase">DEF</p>
                  <p className={clsx("text-xs font-black", multiplier < 1 ? "text-yellow-400" : "text-blue-400")}>{displayDef}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase">HP</p>
                  <p className="text-xs font-black text-green-400">{card.hp}</p>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center flex-1 p-4 text-center bg-slate-900/40 gap-3"
            style={{ minHeight: 220 }}
          >
            <div className="text-3xl opacity-30">{SLOT_ICONS[index]}</div>
            <div>
              <p className="text-sm font-bold text-slate-500">{SLOT_LABELS[index]}</p>
              <p className="text-[10px] text-slate-600 mt-0.5 leading-snug">{SLOT_DESCRIPTIONS[index]}</p>
            </div>
            <div className="text-xs text-slate-600 border border-slate-700 border-dashed rounded-lg px-2 py-1">
              Click a card below
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Synergy Panel ────────────────────────────────────────────────────────────

function SynergyPanel({ slots, prevSynergyCountRef }: { slots: (TeamBuilderCard | null)[]; prevSynergyCountRef: React.MutableRefObject<number> }) {
  const synergies = computeSynergies(slots);
  const activeSynergies = synergies.filter(s => s.active);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    const activeCount = activeSynergies.length;
    if (activeCount > prevSynergyCountRef.current) {
      setPulsing(true);
      setTimeout(() => setPulsing(false), 1500);
    }
    prevSynergyCountRef.current = activeCount;
  }, [activeSynergies.length]);

  return (
    <motion.div
      layout
      className={clsx(
        'rounded-2xl border p-3 transition-all duration-500',
        activeSynergies.length > 0
          ? 'bg-slate-900/80 border-purple-500/30'
          : 'bg-slate-900/40 border-slate-800',
        pulsing && 'shadow-[0_0_30px_rgba(168,85,247,0.4)]',
      )}
    >
      <div className="flex items-center justify-between pointer-events-auto mb-2">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
          <Star size={10} className="text-purple-400" />
          Team Synergy
        </p>
        <a href="/wiki#team-synergies" className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 z-50 relative pointer-events-auto">
          <BookOpenText size={12} weight="bold" /> Learn more in the Wiki
        </a>
      </div>
      <div className="flex flex-wrap gap-2">
        <AnimatePresence>
          {synergies.map((syn, i) => (
            <motion.div
              key={syn.label}
              initial={{ opacity: 0, scale: 0.8, x: -8 }}
              animate={{
                opacity: 1, scale: pulsing && syn.active ? [1, 1.05, 1] : 1, x: 0,
              }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ delay: i * 0.05, type: 'spring', stiffness: 300, damping: 25 }}
              className={clsx(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold border',
                syn.active
                  ? 'border-purple-500/30 bg-purple-500/10'
                  : 'border-slate-700 bg-slate-800/60',
              )}
            >
              <span>{syn.icon}</span>
              <span className={syn.color}>{syn.label}</span>
              <span className="text-slate-400 text-[10px]">— {syn.description}</span>
            </motion.div>
          ))}
        </AnimatePresence>
        {synergies.length === 0 && (
          <span className="text-xs text-slate-600 italic">Select cards to see synergies</span>
        )}
      </div>
    </motion.div>
  );
}

// ─── Type Chart Panel (Pokémon-style matrix) ─────────────────────────────────

const ALL_TYPES = ['Python', 'JavaScript', 'Ruby', 'PHP', 'TypeScript', 'Rust', 'C', 'C++', 'Go', 'CSS'];

function getMatchupMultiplier(attacker: string, defender: string): number {
  // CSS loses to every type
  if (attacker === 'CSS') {
    return defender === 'CSS' ? 1 : 0.75;
  }
  // Check advantage
  if (TYPE_ADVANTAGES[attacker]?.includes(defender)) return 1.5;
  // Check disadvantage (defender has advantage over attacker)
  if (TYPE_ADVANTAGES[defender]?.includes(attacker)) return 0.75;
  return 1;
}

const LANG_BG_HEX: Record<string, string> = {
  Python:     '#3572A5',
  JavaScript: '#f1e05a',
  Ruby:       '#CC342D',
  PHP:        '#4F5D95',
  TypeScript: '#3178C6',
  Rust:       '#DEA584',
  C:          '#555555',
  'C++':      '#6866fb',
  Go:         '#00ADD8',
  CSS:        '#563d7c',
};

function TypeChartPanel({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.97 }}
      className="bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl"
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold text-white flex items-center gap-2">
          <ChartBar size={16} className="text-purple-400" /> Type Advantage Chart
        </p>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="overflow-x-auto pb-2">
        <table className="border-collapse" style={{ minWidth: 460 }}>
          <thead>
            <tr>
              {/* Corner cell */}
              <th className="sticky left-0 z-10 bg-slate-900 p-0">
                <div className="w-[72px] h-[72px] flex items-end justify-start p-1">
                  <span className="text-[8px] text-slate-500 uppercase leading-tight">Atk ↓ / Def →</span>
                </div>
              </th>
              {ALL_TYPES.map(t => (
                <th key={t} className="p-0" style={{ width: 44, height: 86, position: 'relative' }}>
                  {/* Outer wrapper: centers horizontally at column midpoint */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 4,
                      left: '50%',
                      transform: 'translateX(-50%)',
                    }}
                  >
                    {/* Inner wrapper: rotates from its own bottom-center */}
                    <div
                      style={{
                        transform: 'rotate(-45deg)',
                        transformOrigin: 'center bottom',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span
                        className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: LANG_BG_HEX[t] || '#475569',
                          color: t === 'JavaScript' ? '#1a1a1a' : '#fff',
                        }}
                      >
                        {t}
                      </span>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_TYPES.map(attacker => (
              <tr key={attacker} className="group">
                {/* Row label */}
                <td className="sticky left-0 z-10 bg-slate-900 pr-1.5">
                  <span
                    className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
                    style={{
                      backgroundColor: LANG_BG_HEX[attacker] || '#475569',
                      color: attacker === 'JavaScript' ? '#1a1a1a' : '#fff',
                    }}
                  >
                    {attacker}
                  </span>
                </td>
                {ALL_TYPES.map(defender => {
                  const mult = getMatchupMultiplier(attacker, defender);
                  const isSelf = attacker === defender;
                  let bgClass = '';
                  let textClass = '';
                  let label = '';

                  if (isSelf) {
                    bgClass = 'bg-slate-800/40';
                  } else if (mult === 1.5) {
                    bgClass = 'bg-green-600/70';
                    textClass = 'text-white font-black';
                    label = '1.5×';
                  } else if (mult === 0.75) {
                    bgClass = 'bg-red-600/70';
                    textClass = 'text-white font-black';
                    label = '0.75×';
                  } else {
                    bgClass = 'bg-slate-800/20';
                  }

                  return (
                    <td
                      key={defender}
                      className={clsx(
                        'border border-slate-700/40 text-center transition-all duration-100',
                        'hover:brightness-125 hover:border-slate-500',
                        bgClass,
                      )}
                      style={{ width: 36, height: 36, padding: 0 }}
                      title={`${attacker} → ${defender}: ×${mult}`}
                    >
                      {label && (
                        <span className={clsx('text-[9px]', textClass)}>
                          {label}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3.5 h-3.5 rounded bg-green-600/70 border border-green-500/40" />
          <span>1.5× (super effective)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3.5 h-3.5 rounded bg-red-600/70 border border-red-500/40" />
          <span>0.75× (not very effective)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3.5 h-3.5 rounded bg-slate-800/40 border border-slate-700/40" />
          <span>1× (neutral)</span>
        </div>
      </div>
      <p className="text-[9px] text-slate-500 mt-1.5">CSS deals 0.75× against all types (chaotic wildcard).</p>
    </motion.div>
  );
}

// ─── Confirmation Modal ───────────────────────────────────────────────────────

function ConfirmationModal({
  slots,
  mode,
  defenderUsername,
  onConfirm,
  onCancel,
  loading,
}: {
  slots: (TeamBuilderCard | null)[];
  mode: 'random' | 'challenge';
  defenderUsername?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  const synergies = computeSynergies(slots).filter(s => s.active);
  const filled = slots.filter(Boolean) as TeamBuilderCard[];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="bg-slate-900 border border-slate-700 rounded-none sm:rounded-3xl p-6 sm:max-w-md w-full h-full sm:h-auto overflow-y-auto sm:overflow-visible shadow-2xl space-y-5"
      >
        <div className="text-center">
          <div className="text-4xl mb-2">{mode === 'random' ? '⚡' : '🎯'}</div>
          <h2 className="text-2xl font-black text-white">
            {mode === 'random' ? 'Battle Random?' : `Challenge ${defenderUsername}?`}
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            {mode === 'random'
              ? 'Your team will be matched against a random opponent.'
              : `Your challenge will be sent to ${defenderUsername}. They have 24h to respond.`}
          </p>
        </div>

        {/* Team order preview */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Your Team (in order)</p>
          <div className="space-y-2">
            {filled.map((card, i) => {
              const currentStamina = card.stamina !== undefined ? calculateCurrentStamina(card.stamina, card.lastUsedAt ? new Date(card.lastUsedAt) : new Date(), card.inActiveTeam || false) : 100;
              const multiplier = getStaminaMultiplier(currentStamina);
              const isFatigued = currentStamina < 60;
              return (
                <div key={card.id} className={clsx(
                  'flex items-center gap-3 p-2.5 rounded-xl border',
                  isFatigued ? 'border-yellow-500/50 bg-yellow-900/20' : (RARITY_COLOR[card.rarity]?.replace('text-', 'border-') || 'border-slate-700'),
                  !isFatigued && 'bg-slate-800/60'
                )}>
                  <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-xs font-black text-white flex-shrink-0">
                    {i + 1}
                  </div>
                  <img src={card.avatarUrl} alt={card.name} className="w-8 h-8 rounded-lg object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{card.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {isFatigued ? <span className="text-yellow-400 font-bold">FATIGUED ({currentStamina}%)</span> : `${SLOT_LABELS[i]} · ${card.rarity}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 text-xs">
                    <span className={isFatigued ? "text-yellow-400 font-bold" : "text-red-400"}>{Math.floor(card.atk * multiplier)}</span>
                    <span className="text-slate-600 mx-0.5">/</span>
                    <span className={isFatigued ? "text-yellow-400 font-bold" : "text-blue-400"}>{Math.floor(card.def * multiplier)}</span>
                    <span className="text-slate-600 mx-0.5">/</span>
                    <span className="text-green-400">{card.hp}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Synergy bonuses */}
        {synergies.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Active Bonuses</p>
            <div className="flex flex-wrap gap-1.5">
              {synergies.map(syn => (
                <span key={syn.label} className="text-xs bg-purple-500/15 border border-purple-500/30 rounded-lg px-2 py-1 text-purple-300">
                  {syn.icon} {syn.label} — {syn.description}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={clsx(
              'flex-1 py-3 rounded-xl font-bold text-white transition-all disabled:opacity-60',
              mode === 'random'
                ? 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 shadow-[0_0_20px_rgba(220,38,38,0.3)]'
                : 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.3)]',
            )}
          >
            {loading ? 'Sending...' : mode === 'random' ? '⚡ Battle!' : '🎯 Send Challenge'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Friend Selection Modal ───────────────────────────────────────────────────

function FriendModal({
  recentOpponents,
  onSelect,
  onCancel,
}: {
  recentOpponents: string[];
  onSelect: (username: string) => void;
  onCancel: () => void;
}) {
  const [search, setSearch] = useState('');
  const [friends, setFriends] = useState<{user: {id: string, username: string, level: number}}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/friends', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data.friends) {
          setFriends(data.friends);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filteredFriends = friends.filter(f => 
    f.user.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-slate-900 border border-slate-700 rounded-none sm:rounded-3xl p-6 sm:max-w-sm w-full h-full sm:h-auto shadow-2xl space-y-4 flex flex-col"
      >
        <div className="flex items-center justify-between shrink-0">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Users size={20} className="text-orange-400" /> Challenge a Friend
          </h2>
          <button onClick={onCancel} className="text-slate-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="relative shrink-0">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search friends..."
            className="w-full pl-9 pr-4 py-3 rounded-xl bg-black/40 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 custom-scrollbar">
          {loading ? (
            <div className="py-8 text-center text-slate-500">
              <div className="w-6 h-6 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm">Loading friends...</p>
            </div>
          ) : filteredFriends.length > 0 ? (
            <>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 py-1">Your Friends</p>
              {filteredFriends.map(f => (
                <button
                  key={f.user.id}
                  onClick={() => onSelect(f.user.username)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 hover:border-orange-500/30 border border-transparent transition-all text-left group"
                >
                  <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-lg font-black text-white flex-shrink-0 relative overflow-hidden ring-1 ring-white/10">
                    {f.user.username[0]?.toUpperCase()}
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 pt-0.5">
                      <p className="text-[7px] text-center font-bold text-orange-400">LVL {f.user.level}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-white group-hover:text-orange-100 transition-colors">{f.user.username}</span>
                  <ArrowRight size={14} className="ml-auto text-slate-500 group-hover:text-orange-400 transition-colors" />
                </button>
              ))}
            </>
          ) : search.trim() ? (
            <div className="py-8 text-center text-slate-500">
              <p className="text-sm mb-3">No friends found matching &quot;{search}&quot;</p>
              <button
                onClick={() => onSelect(search.trim())}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-colors flex items-center justify-center gap-2 border border-slate-700"
              >
                <ArrowRight size={16} /> Challenge anyway
              </button>
            </div>
          ) : (
            <div className="py-8 text-center text-slate-500">
              <p className="text-sm">You have no friends yet.</p>
              <p className="text-xs mt-1 opacity-70">Add friends from their profiles to challenge them easily!</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Filter Bottom Sheet (Mobile) ─────────────────────────────────────────────

function FilterSheet({
  filters,
  setFilters,
  sort,
  setSort,
  availableRarities,
  availableLanguages,
  availablePacks,
  onClose,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  sort: SortOption;
  setSort: (s: SortOption) => void;
  availableRarities: string[];
  availableLanguages: string[];
  availablePacks: string[];
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        onClick={e => e.stopPropagation()}
        className="bg-slate-900 border-t border-slate-700 rounded-t-3xl p-5 w-full sm:max-w-lg space-y-5 h-full max-h-[90vh] sm:max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <p className="font-bold text-white text-lg">Filter & Sort</p>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <FilterControls
          filters={filters}
          setFilters={setFilters}
          sort={sort}
          setSort={setSort}
          availableRarities={availableRarities}
          availableLanguages={availableLanguages}
          availablePacks={availablePacks}
          vertical
        />
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold transition-colors"
        >
          Apply Filters
        </button>
      </motion.div>
    </motion.div>
  );
}

// ─── Filter Controls ──────────────────────────────────────────────────────────

interface Filters {
  rarity: string[];
  language: string[];
  pack: string[];
}

type SortOption = 'atk' | 'def' | 'hp' | 'power' | 'rarity';

function FilterControls({
  filters,
  setFilters,
  sort,
  setSort,
  availableRarities,
  availableLanguages,
  availablePacks,
  vertical = false,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  sort: SortOption;
  setSort: (s: SortOption) => void;
  availableRarities: string[];
  availableLanguages: string[];
  availablePacks: string[];
  vertical?: boolean;
}) {
  const toggle = (key: keyof Filters, value: string) => {
    setFilters({
      ...filters,
      [key]: filters[key].includes(value)
        ? filters[key].filter(x => x !== value)
        : [...filters[key], value],
    });
  };

  const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: 'atk', label: '⚔ ATK' },
    { value: 'def', label: '🛡 DEF' },
    { value: 'hp', label: '♥ HP' },
    { value: 'power', label: '✨ Power' },
    { value: 'rarity', label: '⭐ Rarity' },
  ];

  return (
    <div className={clsx('space-y-3', !vertical && 'flex flex-wrap gap-3 items-center space-y-0')}>
      {/* Rarity filter */}
      <div className={vertical ? '' : 'flex items-center gap-1.5'}>
        {!vertical && <span className="text-xs text-slate-500 uppercase tracking-wider mr-1">Rarity:</span>}
        {vertical && <p className="text-xs uppercase tracking-wider text-slate-500 mb-1.5">Rarity</p>}
        <div className="flex flex-wrap gap-1.5">
          {availableRarities.map(r => (
            <button
              key={r}
              onClick={() => toggle('rarity', r)}
              className={clsx(
                'px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all',
                filters.rarity.includes(r)
                  ? `${RARITY_BG[r]} ${RARITY_COLOR[r]} border-current`
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Language filter */}
      {availableLanguages.length > 0 && (
        <div className={vertical ? '' : 'flex items-center gap-1.5'}>
          {!vertical && <span className="text-xs text-slate-500 uppercase tracking-wider mr-1">Type:</span>}
          {vertical && <p className="text-xs uppercase tracking-wider text-slate-500 mb-1.5">Type / Language</p>}
          <div className="flex flex-wrap gap-1.5">
            {availableLanguages.map(l => (
              <button
                key={l}
                onClick={() => toggle('language', l)}
                className={clsx(
                  'px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all',
                  filters.language.includes(l)
                    ? `bg-slate-700 ${LANG_COLOR[l] || 'text-white'} border-current`
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pack filter */}
      {availablePacks.length > 1 && (
        <div className={vertical ? '' : 'flex items-center gap-1.5'}>
          {!vertical && <span className="text-xs text-slate-500 uppercase tracking-wider mr-1">Pack:</span>}
          {vertical && <p className="text-xs uppercase tracking-wider text-slate-500 mb-1.5">Pack Origin</p>}
          <div className="flex flex-wrap gap-1.5">
            {availablePacks.map(p => (
              <button
                key={p}
                onClick={() => toggle('pack', p)}
                className={clsx(
                  'px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all',
                  filters.pack.includes(p)
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sort */}
      <div className={vertical ? '' : 'flex items-center gap-1.5 ml-auto'}>
        {!vertical && <SortAscending size={13} className="text-slate-500 hidden sm:block" />}
        {vertical && <p className="text-xs uppercase tracking-wider text-slate-500 mb-1.5">Sort By</p>}
        
        {/* Desktop Sort (Hidden on mobile unless vertical) */}
        <div className={clsx("gap-1.5", vertical ? "flex flex-wrap" : "hidden sm:flex")}>
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSort(opt.value)}
              className={clsx(
                'px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all min-h-[44px] sm:min-h-0',
                sort === opt.value
                  ? 'bg-orange-500/20 text-orange-300 border-orange-500/50'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Mobile Sort Dropdown (Visible on non-vertical mobile) */}
        {!vertical && (
          <div className="sm:hidden w-full relative mt-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
               <SortAscending size={16} />
            </span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="w-full pl-9 pr-4 py-3 min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold text-slate-300 appearance-none focus:outline-none focus:border-orange-500/50"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>Sort: {opt.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const SESSION_KEY_FILTERS = 'tb_filters';
const SESSION_KEY_SORT = 'tb_sort';

function loadSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function TeamBuilderUI({
  userCards,
  challengeUsername: initialChallengeUsername = '',
  onSubmitRandom,
  onSubmitChallenge,
  loading = false,
  mode,
  respondingToChallenger,
  onRespond,
  leagueMode = 'OPEN',
  setLeagueMode,
  powerCap = 99999,
  userBits = 0,
}: TeamBuilderProps) {
  const [showTypeChart, setShowTypeChart] = useState(false);
  const [showConfirmRandom, setShowConfirmRandom] = useState(false);
  const [showFriendModal, setShowFriendModal] = useState(false);
  const [showConfirmChallenge, setShowConfirmChallenge] = useState(false);
  const [pendingChallengeUsername, setPendingChallengeUsername] = useState(initialChallengeUsername);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [slots, setSlots] = useState<(TeamBuilderCard | null)[]>(() => {
    const activeCards = userCards.filter(c => c.inActiveTeam);
    if (activeCards.length > 0) {
      const init: (TeamBuilderCard | null)[] = [null, null, null];
      activeCards.forEach((c, i) => { if (i < 3) init[i] = c; });
      return init;
    }
    if (userCards.length === 3) {
      return [userCards[0], userCards[1], userCards[2]];
    }
    return [null, null, null];
  });

  const prevSynergyCount = useRef(0);
  const isInitialMount = useRef(true);

  const [filters, setFiltersState] = useState<Filters>(() =>
    loadSession<Filters>(SESSION_KEY_FILTERS, { rarity: [], language: [], pack: [] })
  );
  const [sort, setSortState] = useState<SortOption>(() =>
    loadSession<SortOption>(SESSION_KEY_SORT, 'power')
  );

  const setFilters = (f: Filters) => {
    setFiltersState(f);
    sessionStorage.setItem(SESSION_KEY_FILTERS, JSON.stringify(f));
  };
  
  const setSort = (s: SortOption) => {
    setSortState(s);
    sessionStorage.setItem(SESSION_KEY_SORT, s);
  };

  // Sync team selection to database
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const handler = setTimeout(() => {
      const activeIds = slots.filter(Boolean).map(c => c!.id);
      fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardIds: activeIds })
      }).catch(console.error);
    }, 1000);
    return () => clearTimeout(handler);
  }, [slots]);

  // Unique filter data
  const availableRarities = RARITY_ORDER.filter(r => userCards.some(c => c.rarity === r));
  const availableLanguages = Array.from(new Set(userCards.map(c => c.primaryLanguage || 'Unknown'))).filter(Boolean);
  const availablePacks = Array.from(new Set(userCards.map(c => c.pack || 'Unknown'))).filter(Boolean);

  const slottedIds = new Set(slots.filter(Boolean).map(c => c!.id));

  // Filtered & Sorted cards
  const filteredCards = userCards
    .filter(c => {
      if (filters.rarity.length > 0 && !filters.rarity.includes(c.rarity)) return false;
      if (filters.language.length > 0 && !filters.language.includes(c.primaryLanguage || 'Unknown')) return false;
      if (filters.pack.length > 0 && !filters.pack.includes(c.pack || 'Unknown')) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === 'atk') return b.atk - a.atk;
      if (sort === 'def') return b.def - a.def;
      if (sort === 'hp') return b.hp - a.hp;
      if (sort === 'rarity') return RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity);
      return (b.atk + b.def + b.hp) - (a.atk + a.def + a.hp);
    });

  const activeFilterCount = filters.rarity.length + filters.language.length + filters.pack.length;
  const teamFull = slots.every(Boolean);

  // ─── League Eligibility ─────────────────────────────────────────────────────

  function getCardIneligibilityReason(card: TeamBuilderCard): string | null {
    if (leagueMode === 'COMMON') {
      if (card.rarity !== 'Common' && card.rarity !== 'Uncommon') return 'Only Common/Uncommon cards allowed';
    }
    if (leagueMode === 'LEGENDARY') {
      if (card.rarity !== 'Legendary') return 'Only Legendary cards allowed';
    }
    if (leagueMode === 'DIVERSITY') {
      const currentLangs = slots.filter(Boolean).map(c => c!.primaryLanguage || '');
      if (slots.filter(Boolean).length >= 1 && currentLangs.includes(card.primaryLanguage || '')) {
        return 'Card shares a language with existing team member';
      }
      if (!card.primaryLanguage) return 'Card has no primary language';
    }
    return null;
  }

  const teamPower = slots.filter(Boolean).reduce((acc, c) => acc + c!.atk + c!.def + c!.hp, 0);

  function handleLeagueChange(newMode: LeagueMode) {
    if (newMode === leagueMode) return;
    const hasCards = slots.some(Boolean);
    if (hasCards) {
      setSlots([null, null, null]);
    }
    setLeagueMode?.(newMode);
  }

  const placeCard = (card: TeamBuilderCard) => {
    const currentStamina = card.stamina !== undefined ? calculateCurrentStamina(card.stamina, card.lastUsedAt ? new Date(card.lastUsedAt) : new Date(), card.inActiveTeam || false) : 100;
    if (currentStamina === 0) return;
    if (getCardIneligibilityReason(card)) return;

    // Balanced league: check if adding this would exceed cap
    if (leagueMode === 'BALANCED') {
      const newPower = teamPower + card.atk + card.def + card.hp;
      if (newPower > powerCap) return;
    }

    if (slottedIds.has(card.id!)) return;
    setSlots(prev => {
      const next = [...prev];
      const emptyIdx = next.findIndex(s => s === null);
      if (emptyIdx !== -1) {
        next[emptyIdx] = card;
        return next;
      }
      next[2] = card;
      return next;
    });
  };

  const removeCard = (index: number) => {
    setSlots(prev => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  };

  const handleBattleRandom = () => {
    if (!teamFull) return;
    setShowConfirmRandom(true);
  };

  const handleConfirmRandom = () => {
    const ids = slots.filter(Boolean).map(c => c!.id!);
    setSubmitting(true);
    setShowConfirmRandom(false);
    // Animate slots toward center before calling
    setTimeout(() => {
      onSubmitRandom(ids);
      setSubmitting(false);
    }, 400);
  };

  const handleChallengeClick = () => {
    if (!teamFull) return;
    setShowFriendModal(true);
  };

  const handleFriendSelect = (username: string) => {
    setPendingChallengeUsername(username);
    setShowFriendModal(false);
    setShowConfirmChallenge(true);
  };

  const handleConfirmChallenge = () => {
    const ids = slots.filter(Boolean).map(c => c!.id!);
    setSubmitting(true);
    setShowConfirmChallenge(false);
    setTimeout(() => {
      onSubmitChallenge(ids, pendingChallengeUsername);
      setSubmitting(false);
    }, 400);
  };

  const handleRespond = () => {
    if (!teamFull || !onRespond) return;
    const ids = slots.filter(Boolean).map(c => c!.id!);
    onRespond(ids);
  };

  // Empty state
  if (userCards.length === 0) {
    return (
      <div className="text-center py-20 space-y-4">
        <GameController size={64} className="mx-auto text-slate-600" />
        <p className="text-xl font-bold text-slate-300">You have no cards!</p>
        <p className="text-slate-500">Open some booster packs to get started.</p>
        <a
          href="/store"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-600 to-amber-600 text-white rounded-xl font-bold hover:from-orange-500 hover:to-amber-500 transition-all"
        >
          Go to the Store
        </a>
      </div>
    );
  }

  if (userCards.length < 3) {
    return (
      <div className="text-center py-20 space-y-4">
        <WarningCircle size={64} className="mx-auto text-yellow-500" />
        <p className="text-xl font-bold text-white">You need at least 3 cards to battle.</p>
        <p className="text-slate-400">You have {userCards.length} card{userCards.length !== 1 ? 's' : ''}. Open more booster packs!</p>
        <a
          href="/store"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-600 to-amber-600 text-white rounded-xl font-bold hover:from-orange-500 hover:to-amber-500 transition-all"
        >
          Open Booster Packs
        </a>
      </div>
    );
  }

  // Recent opponents (from outgoing challenges stored in userCards context - we pass a simpler mock)
  const recentOpponents: string[] = [];

  return (
    <div className="space-y-5">

      {/* ─── League Selector ─── */}
      {setLeagueMode && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
            <Crown size={12} className="text-yellow-400" /> Select League Mode
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {(Object.keys(LEAGUE_CONFIG) as LeagueMode[]).map(mode => {
              const cfg = LEAGUE_CONFIG[mode];
              const isActive = leagueMode === mode;
              const cantAfford = mode === 'LEGENDARY' && userBits < 500;
              return (
                <button
                  key={mode}
                  onClick={() => handleLeagueChange(mode)}
                  disabled={cantAfford}
                  className={clsx(
                    'relative rounded-xl border-2 p-3 text-left transition-all duration-200',
                    isActive ? `${cfg.border} ${cfg.bg} shadow-lg` : 'border-slate-700 bg-slate-900/40 hover:border-slate-500',
                    cantAfford && 'opacity-40 cursor-not-allowed'
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-lg">{cfg.icon}</span>
                    <span className={clsx('text-xs font-bold', isActive ? cfg.color : 'text-slate-400')}>{cfg.label}</span>
                  </div>
                  <p className="text-[9px] text-slate-500 leading-tight">{cfg.description}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[9px] text-yellow-400">+{cfg.winBits} BITS</span>
                    <span className="text-[9px] text-blue-400">+{cfg.winXp} XP</span>
                  </div>
                  {cfg.entryFee && <span className="text-[8px] text-red-400 mt-0.5 block">Entry: {cfg.entryFee} BITS</span>}
                  {isActive && <div className={clsx('absolute top-1.5 right-1.5 w-2 h-2 rounded-full', cfg.border.replace('border-', 'bg-'))} />}
                </button>
              );
            })}
          </div>

          {/* Balanced League Power Meter */}
          {leagueMode === 'BALANCED' && (
            <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-2">
              <span className="text-xs text-blue-400 font-bold">Team Power:</span>
              <div className="flex-1 bg-slate-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className={clsx('h-full rounded-full transition-all duration-300', teamPower > powerCap ? 'bg-red-500' : teamPower > powerCap * 0.8 ? 'bg-yellow-500' : 'bg-blue-500')}
                  style={{ width: `${Math.min(100, (teamPower / powerCap) * 100)}%` }}
                />
              </div>
              <span className={clsx('text-xs font-black', teamPower > powerCap ? 'text-red-400' : 'text-blue-300')}>
                {teamPower} / {powerCap}
              </span>
            </div>
          )}

          {/* Legendary League Entry Fee Warning */}
          {leagueMode === 'LEGENDARY' && (
            <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-2">
              <Crown size={16} className="text-yellow-400" />
              <span className="text-xs text-yellow-300">500 BITS entry fee will be charged per battle</span>
              <span className="ml-auto text-xs text-slate-400">Balance: <span className="text-yellow-400 font-bold">{userBits}</span></span>
            </div>
          )}
        </div>
      )}

      {/* ─── Action Buttons ─── */}
      <div className="flex flex-col gap-3">
        {mode === 'respond' ? (
          <>
            <div className="flex-1 text-center py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
              <p className="text-sm font-bold text-yellow-400">Responding to <span className="text-white">{respondingToChallenger}</span>&apos;s challenge</p>
              <p className="text-xs text-slate-400 mt-0.5">Select your team, then confirm below.</p>
            </div>
            <button
              onClick={handleRespond}
              disabled={!teamFull || loading}
              className="sm:w-48 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 disabled:opacity-40 transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] flex items-center justify-center gap-2"
            >
              <Sword size={18} weight="fill" />
              {!teamFull ? `Select ${slots.filter(s => !s).length} more` : loading ? 'Fighting...' : 'Accept & Fight!'}
            </button>
          </>
        ) : (
          <>
            {mode === 'quick' && (
              <motion.button
                onClick={handleBattleRandom}
                disabled={!teamFull || loading || submitting}
                whileTap={teamFull ? { scale: 0.97 } : {}}
                className={clsx(
                  'flex-1 py-4 rounded-2xl font-black text-lg text-white transition-all flex items-center justify-center gap-2.5',
                  teamFull
                    ? 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 shadow-[0_0_25px_rgba(220,38,38,0.4)]'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed',
                )}
              >
                <Lightning size={22} weight="fill" />
                {loading ? 'Matchmaking...' : teamFull ? 'Battle Random' : `Select ${slots.filter(s => !s).length} more card${slots.filter(s => !s).length !== 1 ? 's' : ''}`}
              </motion.button>
            )}
            
            {mode === 'challenge' && (
              <motion.button
                onClick={handleChallengeClick}
                disabled={!teamFull || loading || submitting}
                whileTap={teamFull ? { scale: 0.97 } : {}}
                className={clsx(
                  'flex-1 py-4 rounded-2xl font-black text-lg text-white transition-all flex items-center justify-center gap-2.5',
                  teamFull
                    ? 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.3)]'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed',
                )}
              >
                <Users size={22} weight="fill" />
                Challenge a Friend
              </motion.button>
            )}
          </>
        )}
      </div>

      {/* ─── Team Slots ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {slots.map((card, i) => (
          <TeamSlot
            key={i}
            index={i}
            card={card}
            onRemove={() => removeCard(i)}
          />
        ))}
      </div>

      {/* Drag to reorder hint (desktop) */}
      {teamFull && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-xs text-slate-600 flex items-center justify-center gap-1.5"
        >
          <ArrowsVertical size={12} /> Click a card slot to remove it, pick a different one below, then re-place it.
        </motion.p>
      )}

      {/* ─── Synergy Panel ─── */}
      <SynergyPanel slots={slots} prevSynergyCountRef={prevSynergyCount} />

      {/* ─── Type Chart Toggle ─── */}
      <div>
        <button
          onClick={() => setShowTypeChart(v => !v)}
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-600 mb-2"
        >
          <Info size={13} />
          {showTypeChart ? 'Hide' : 'Show'} Type Advantage Chart
        </button>
        <AnimatePresence>
          {showTypeChart && (
            <TypeChartPanel onClose={() => setShowTypeChart(false)} />
          )}
        </AnimatePresence>
      </div>

      {/* ─── Collection Grid ─── */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        {/* Header + Filters */}
        <div className="p-4 border-b border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-white">
              Your Collection
              <span className="ml-2 text-xs text-slate-500 font-normal">{filteredCards.length} cards</span>
            </p>
            {/* Mobile filter button */}
            <button
              onClick={() => setShowFilterSheet(true)}
              className="sm:hidden flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg px-3 py-1.5 transition-colors"
            >
              <Funnel size={13} />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-1 bg-orange-500 text-white text-[10px] font-bold px-1.5 rounded-full">{activeFilterCount}</span>
              )}
            </button>
          </div>

          {/* Desktop filters */}
          <div className="hidden sm:block">
            <FilterControls
              filters={filters}
              setFilters={setFilters}
              sort={sort}
              setSort={setSort}
              availableRarities={availableRarities}
              availableLanguages={availableLanguages}
              availablePacks={availablePacks}
            />
          </div>

          {/* Active filter chips (mobile) */}
          {activeFilterCount > 0 && (
            <div className="sm:hidden flex flex-wrap gap-1.5">
              {[...filters.rarity, ...filters.language, ...filters.pack].map(f => (
                <span key={f} className="text-xs bg-orange-500/20 border border-orange-500/30 text-orange-300 rounded-full px-2.5 py-0.5 flex items-center gap-1">
                  {f}
                  <button onClick={() => {
                    const newFilters = { ...filters };
                    for (const k of ['rarity', 'language', 'pack'] as const) {
                      newFilters[k] = newFilters[k].filter(x => x !== f);
                    }
                    setFilters(newFilters);
                  }}>
                    <X size={10} />
                  </button>
                </span>
              ))}
              <button
                onClick={() => setFilters({ rarity: [], language: [], pack: [] })}
                className="text-xs text-slate-500 hover:text-white"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Grid */}
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[450px] overflow-y-auto w-full overflow-x-hidden">
          <AnimatePresence>
            {filteredCards.map(card => {
              const placed = slottedIds.has(card.id!);
              const slotIdx = slots.findIndex(s => s?.id === card.id);
              const ineligibleReason = !placed ? getCardIneligibilityReason(card) : null;
              const isBalancedOverflow = !placed && leagueMode === 'BALANCED' && (teamPower + card.atk + card.def + card.hp) > powerCap;
              const isDimmed = !!ineligibleReason || isBalancedOverflow;
              return (
                <motion.div
                  key={card.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.18 }}
                  className="relative"
                  title={ineligibleReason || (isBalancedOverflow ? 'Would exceed power cap' : undefined)}
                >
                  <CompactCard
                    card={card}
                    placed={placed}
                    slotIndex={slotIdx >= 0 ? slotIdx : undefined}
                    dimmed={isDimmed}
                    onClick={() => !placed && !isDimmed && placeCard(card)}
                  />
                  {isDimmed && !placed && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 pointer-events-none">
                      <div className="flex flex-col items-center gap-1">
                        <Lock size={20} weight="fill" className="text-slate-400" />
                        <span className="text-[9px] text-slate-400 text-center px-2 leading-tight">{ineligibleReason || 'Exceeds cap'}</span>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
          {filteredCards.length === 0 && (
            <div className="col-span-2 text-center py-12 text-slate-500 space-y-2">
              <Funnel size={32} className="mx-auto opacity-40" />
              <p>No cards match your filters.</p>
              <button onClick={() => setFilters({ rarity: [], language: [], pack: [] })} className="text-xs text-orange-400 hover:text-orange-300 underline">
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Modals ─── */}
      <AnimatePresence>
        {showConfirmRandom && (
          <ConfirmationModal
            slots={slots}
            mode="random"
            onConfirm={handleConfirmRandom}
            onCancel={() => setShowConfirmRandom(false)}
            loading={loading || submitting}
          />
        )}
        {showFriendModal && (
          <FriendModal
            recentOpponents={recentOpponents}
            onSelect={handleFriendSelect}
            onCancel={() => setShowFriendModal(false)}
          />
        )}
        {showConfirmChallenge && (
          <ConfirmationModal
            slots={slots}
            mode="challenge"
            defenderUsername={pendingChallengeUsername}
            onConfirm={handleConfirmChallenge}
            onCancel={() => setShowConfirmChallenge(false)}
            loading={loading || submitting}
          />
        )}
        {showFilterSheet && (
          <FilterSheet
            filters={filters}
            setFilters={setFilters}
            sort={sort}
            setSort={setSort}
            availableRarities={availableRarities}
            availableLanguages={availableLanguages}
            availablePacks={availablePacks}
            onClose={() => setShowFilterSheet(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
