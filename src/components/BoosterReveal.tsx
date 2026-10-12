'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore } from 'react';
import { Card, CardProps } from '@/components/Card';
import { RarityGem } from '@/components/RarityGem';
import { Logo, LogoMark } from '@/components/Logo';
import { motion, AnimatePresence, useReducedMotion, useMotionValue, useTransform } from 'framer-motion';
import { Sparkle, CaretLeft, CaretRight, FastForward } from '@phosphor-icons/react';
import clsx from 'clsx';
import {
  playCardFling,
  playCardReveal,
  playPackTear,
  playSuspenseRiser,
  preloadBoosterSounds,
} from '@/lib/boosterAudio';

type RevealCard = CardProps & { isDuplicate?: boolean; fragmentsEarned?: number };

export interface BoosterPackTheme {
  gradient?: string;
  border?: string;
  textColor?: string;
  accentColor?: string;
}

interface BoosterRevealProps {
  cards: RevealCard[];
  packDropFragments: { language: string; amount: number } | null;
  onComplete: () => void;
  /** Shown on the sealed pack before it is torn open */
  packName?: string;
  packTheme?: BoosterPackTheme | null;
}

const RARITY_VALUES: Record<string, number> = {
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  Epic: 4,
  Legendary: 5,
};

// Best card last, like a real booster
function sortCards(cards: RevealCard[]) {
  return [...cards].sort((a, b) => (RARITY_VALUES[a.rarity] || 0) - (RARITY_VALUES[b.rarity] || 0));
}

export type Suspense = 'Rare' | 'Epic' | 'Legendary';

/** Glow time on the card back before it turns (ms). */
const SUSPENSE_MS: Record<Suspense, number> = { Rare: 450, Epic: 1300, Legendary: 1900 };
const SUSPENSE_MS_REDUCED: Record<Suspense, number> = { Rare: 0, Epic: 500, Legendary: 700 };
/** Flip duration (s): slower for the big pulls. */
const FLIP_S: Record<string, number> = { Common: 0.45, Uncommon: 0.45, Rare: 0.55, Epic: 0.8, Legendary: 1.0 };
const FLIP_S_REDUCED = 0.2;

function suspenseFor(rarity: string): Suspense | null {
  return rarity === 'Rare' || rarity === 'Epic' || rarity === 'Legendary' ? rarity : null;
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
}

// Pre-computed random values for epic particle effects (module-level, outside render)
const EPIC_PARTICLE_VALUES = Array.from({ length: 8 }, () => ({
  scale: Math.random() * 2 + 1,
  x: (Math.random() - 0.5) * 180,
  y: (Math.random() - 0.5) * 180,
  rotate: Math.random() * 360,
  delay: Math.random(),
}));

// Touch-first device (no hover, coarse pointer) — decides the hint copy.
const COARSE_POINTER_QUERY = '(hover: none) and (pointer: coarse)';
function subscribeCoarsePointer(onChange: () => void) {
  const mql = window.matchMedia(COARSE_POINTER_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
function useIsTouchDevice() {
  return useSyncExternalStore(
    subscribeCoarsePointer,
    () => window.matchMedia(COARSE_POINTER_QUERY).matches,
    () => false
  );
}

// ─── Sealed pack ────────────────────────────────────────────────────────

const TEAR_Y = 14; // % from the top where the wrapper rips
const CRIMP_TEETH = 16;
const CRIMP_AMP = 1.6; // % of the pack height
// Hand-tuned jitter so the rip looks torn, not cut (one value per point)
const TEAR_JAG = [0.4, 1.3, -0.6, 1.7, -1.1, 0.5, 1.9, -0.3, 1.1, -1.4, 0.8, 1.5, -0.7, 1.2, -1.0, 0.6, 1.4, -0.5, 0.9, -1.2, 0.3];

type Pt = [number, number];
const toPolygon = (pts: Pt[]) => `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(', ')})`;

function crimpTop(): Pt[] {
  const step = 100 / (CRIMP_TEETH * 2);
  return Array.from({ length: CRIMP_TEETH * 2 + 1 }, (_, k) => [k * step, k % 2 === 0 ? CRIMP_AMP : 0]);
}
function crimpBottomReversed(): Pt[] {
  const step = 100 / (CRIMP_TEETH * 2);
  return Array.from({ length: CRIMP_TEETH * 2 + 1 }, (_, k) => [100 - k * step, k % 2 === 0 ? 100 - CRIMP_AMP : 100]);
}
function tearLine(): Pt[] {
  const n = TEAR_JAG.length - 1;
  return TEAR_JAG.map((j, k) => [(k / n) * 100, TEAR_Y + j]);
}

const STRIP_CLIP = toPolygon([...crimpTop(), ...tearLine().reverse()]);
const BODY_CLIP = toPolygon([...tearLine(), ...crimpBottomReversed()]);
const WHOLE_CLIP = toPolygon([...crimpTop(), ...crimpBottomReversed()]);

export function PackArt({ name, theme, cardCount }: { name: string; theme?: BoosterPackTheme | null; cardCount: number }) {
  const textColor = theme?.textColor || '#fff';
  return (
    <div
      className="absolute inset-0"
      style={{ background: theme?.gradient || 'linear-gradient(160deg, #4338ca 0%, #6d28d9 45%, #1e1b4b 100%)' }}
    >
      <div className="absolute inset-0 tex-cubes opacity-20 mix-blend-overlay" />
      <div className="absolute inset-0 tex-noise opacity-25 mix-blend-overlay" />
      {/* Foil sheen */}
      <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_25%,rgba(255,255,255,0.28)_45%,transparent_55%,rgba(255,255,255,0.12)_70%,transparent_80%)]" />
      {/* Crimp seals */}
      <div className="absolute top-0 inset-x-0 h-[9%] bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.18)_0_2px,rgba(0,0,0,0.18)_2px_5px)]" />
      <div className="absolute bottom-0 inset-x-0 h-[7%] bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.18)_0_2px,rgba(0,0,0,0.18)_2px_5px)]" />
      {/* Tear guide */}
      <div className="absolute inset-x-3 border-t-2 border-dashed border-white/40" style={{ top: `${TEAR_Y}%` }} />
      <div className="absolute right-3 text-[9px] font-black tracking-[0.3em] text-white/60 uppercase" style={{ top: `calc(${TEAR_Y}% + 4px)` }}>
        tear here
      </div>

      <div className="absolute inset-x-0 top-[24%] flex flex-col items-center text-center px-5">
        <div className="text-[11px] font-display font-extrabold tracking-[0.35em] text-white/75 uppercase mb-4">GitGacha</div>
        <LogoMark size={92} className="mb-5 drop-shadow-[0_0_24px_rgba(255,255,255,0.3)]" />
        <h3 className="font-display text-[26px] font-extrabold tracking-tight leading-none drop-shadow-lg" style={{ color: textColor }}>
          {name}
        </h3>
        <div className="mt-3 text-[10px] font-bold uppercase tracking-[0.3em] bg-black/25 px-3 py-1 rounded-full" style={{ color: textColor }}>
          {cardCount} Cards
        </div>
      </div>
      <div className="absolute bottom-[10%] inset-x-0 text-center text-[10px] font-black tracking-[0.4em] text-white/50 uppercase">
        Booster Pack
      </div>
    </div>
  );
}

function BoosterPack({
  name,
  theme,
  cardCount,
  tearing,
  onTear,
}: {
  name: string;
  theme?: BoosterPackTheme | null;
  cardCount: number;
  tearing: boolean;
  onTear: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const glowColor = theme?.accentColor || theme?.border || '#a78bfa';
  return (
    <div
      className={clsx('relative w-[17rem] h-[27rem] select-none', !tearing && !reduceMotion && 'pack-float')}
      style={{ filter: `drop-shadow(0 18px 30px rgba(0,0,0,0.6)) drop-shadow(0 0 22px ${glowColor}55)` }}
    >
      {!tearing ? (
        <motion.button
          type="button"
          onClick={onTear}
          aria-label={`Tear open ${name}`}
          whileHover={reduceMotion ? undefined : { scale: 1.03, rotate: -1 }}
          whileTap={reduceMotion ? undefined : { scale: 0.97 }}
          className="absolute inset-0 cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-400/70 rounded-md"
          style={{ clipPath: WHOLE_CLIP }}
        >
          <PackArt name={name} theme={theme} cardCount={cardCount} />
        </motion.button>
      ) : (
        <>
          {/* Light spilling out of the rip */}
          <motion.div
            className="absolute inset-x-0 h-16 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.95),rgba(255,255,255,0)_70%)] pointer-events-none z-20"
            style={{ top: `${TEAR_Y}%` }}
            initial={{ opacity: 0, scaleX: 0.3 }}
            animate={{ opacity: [0, 1, 0], scaleX: [0.3, 1.2, 1.4] }}
            transition={{ duration: reduceMotion ? 0.2 : 0.7, ease: 'easeOut' }}
          />
          {/* Torn-off strip */}
          <motion.div
            className="absolute inset-0 pointer-events-none z-10"
            style={{ clipPath: STRIP_CLIP, transformOrigin: '0% 10%' }}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
            animate={reduceMotion ? { opacity: 0 } : { x: 150, y: -110, rotate: 32, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.15 : 0.6, ease: [0.3, 0.6, 0.4, 1] }}
          >
            <PackArt name={name} theme={theme} cardCount={cardCount} />
          </motion.div>
          {/* Pack body slides away */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ clipPath: BODY_CLIP }}
            initial={{ y: 0, opacity: 1, scale: 1 }}
            animate={reduceMotion ? { opacity: 0 } : { y: [0, -6, 70], opacity: [1, 1, 0], scale: [1, 1.01, 0.94] }}
            transition={{ duration: reduceMotion ? 0.15 : 0.7, delay: reduceMotion ? 0 : 0.2, ease: 'easeIn' }}
          >
            <PackArt name={name} theme={theme} cardCount={cardCount} />
          </motion.div>
        </>
      )}
    </div>
  );
}

// ─── Card back ──────────────────────────────────────────────────────────

const BACK_FRAME: Record<string, string> = {
  none: 'conic-gradient(from var(--gg-spin), #7c4dff, #ff4fa3, #ffb86b, #ff4fa3, #7c4dff)',
  Rare: 'linear-gradient(150deg, #e3eeff, #1d4fd8 30%, #9cc6ff 55%, #13307a 80%, #cfe2ff)',
  Epic: 'conic-gradient(from var(--gg-spin), #5b1a9a, #e48bff, #7b5cff, #ff7ad1, #5b1a9a)',
  Legendary: 'conic-gradient(from var(--gg-spin), #fff3c4, #c98a12, #ffe27a, #8a5208, #fff3c4)',
};
const BACK_GLOW: Record<string, string> = {
  none: '0 12px 26px rgba(0,0,0,0.6), 0 0 18px rgba(124,77,255,0.45)',
  Rare: '0 0 30px rgba(79,157,255,0.75)',
  Epic: '0 0 45px rgba(197,107,255,0.9)',
  Legendary: '0 0 60px rgba(255,200,61,1)',
};

export function CardBack({ suspense }: { suspense: Suspense | null }) {
  const key = suspense ?? 'none';
  return (
    <div className="gg-card relative w-full h-full">
      <div aria-hidden className="gg-shadow transition-shadow duration-500" style={{ boxShadow: BACK_GLOW[key] }} />
      <div className="gg-frame gg-chamfer animate-[ggSpin_7s_linear_infinite]" style={{ background: BACK_FRAME[key] }}>
        <div
          className="gg-chamfer relative h-full overflow-hidden flex flex-col items-center justify-center gap-3"
          style={{
            ['--c' as string]: '13px',
            background:
              'radial-gradient(60% 40% at 50% 45%, rgba(124,77,255,0.35), transparent 70%), repeating-linear-gradient(90deg, transparent 0 27px, rgba(255,255,255,0.05) 27px 28px), #0d0d16',
          }}
        >
          {/* Commit lanes */}
          <svg aria-hidden className="absolute inset-0 w-full h-full opacity-50" viewBox="0 0 244 398" preserveAspectRatio="none">
            <g fill="none" stroke="#7c4dff" strokeOpacity=".55" strokeWidth="2">
              <path d="M40 0V398" /><path d="M122 0V140" /><path d="M122 258V398" /><path d="M204 0V398" />
              <path d="M40 90C40 120 122 110 122 140" /><path d="M204 300C204 270 122 280 122 258" />
            </g>
            <g fill="#06060b" stroke="#3ddc97" strokeWidth="2">
              <circle cx="40" cy="40" r="5" /><circle cx="40" cy="330" r="5" /><circle cx="204" cy="70" r="5" />
              <circle cx="204" cy="350" r="5" /><circle cx="122" cy="40" r="5" /><circle cx="122" cy="360" r="5" />
            </g>
          </svg>

          {/* Suspense inner glow */}
          {suspense && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  suspense === 'Legendary' ? 'radial-gradient(circle at 50% 45%, rgba(255,200,61,0.55), transparent 65%)'
                  : suspense === 'Epic' ? 'radial-gradient(circle at 50% 45%, rgba(197,107,255,0.5), transparent 65%)'
                  : 'radial-gradient(circle at 50% 45%, rgba(79,157,255,0.4), transparent 65%)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.3, 1, 0.5, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, repeatType: 'mirror' }}
            />
          )}

          <LogoMark size={112} className="relative drop-shadow-[0_0_22px_rgba(255,79,163,0.5)]" />
          <Logo size={20} showMark={false} className="relative" />
          <div className="relative font-mono text-[10px] tracking-[0.2em] text-slate-400">git pull --rarity</div>
        </div>
      </div>
    </div>
  );
}

// ─── NEW / DUP badge ────────────────────────────────────────────────────

function NewDupBadge({ card, className }: { card: RevealCard; className?: string }) {
  return card.isDuplicate ? (
    <div className={clsx('bg-slate-900/90 backdrop-blur-xl text-rose-400 text-xs font-black px-3 py-1.5 rotate-12 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.2)] border border-rose-500/50 rounded-full pointer-events-none tracking-widest uppercase', className)}>
      DUP <span className="text-rose-300 drop-shadow-[0_0_4px_rgba(244,63,94,0.8)]">+{card.fragmentsEarned}</span>
    </div>
  ) : (
    <div className={clsx('bg-slate-900/90 backdrop-blur-xl text-emerald-400 text-[10px] font-black px-3 py-1.5 -rotate-12 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.2)] border border-emerald-500/50 rounded-full pointer-events-none tracking-widest uppercase', className)}>
      NEW
    </div>
  );
}

// ─── One card in the face-down stack ────────────────────────────────────

// Offsets of the cards under the top one, so the pile looks hand-stacked
const DEPTH_POSE = [
  { x: 0, y: 0, rotate: 0, scale: 1 },
  { x: 7, y: 9, rotate: 3.5, scale: 0.97 },
  { x: -6, y: 16, rotate: -3, scale: 0.94 },
  { x: 4, y: 22, rotate: 1.5, scale: 0.91 },
];

type EnterMode = 'deal' | 'forward' | 'back';

function StackCard({
  card,
  depth,
  isRevealed,
  suspense,
  justRevealed,
  enterMode,
  onActivate,
  onSwipe,
}: {
  card: RevealCard;
  depth: number;
  isRevealed: boolean;
  suspense: Suspense | null;
  justRevealed: boolean;
  enterMode: EnterMode;
  onActivate: () => void;
  onSwipe: (dir: 1 | -1) => void;
}) {
  const reduceMotion = useReducedMotion();
  const isTop = depth === 0;
  const pose = DEPTH_POSE[Math.min(depth, DEPTH_POSE.length - 1)];
  const flipS = reduceMotion ? FLIP_S_REDUCED : FLIP_S[card.rarity] ?? 0.45;

  const dragX = useMotionValue(0);
  const dragRotate = useTransform(dragX, [-220, 220], [-14, 14]);
  const draggedRef = useRef(false);

  const initial =
    enterMode === 'back' && isTop
      ? { x: -420, y: -40, rotate: -25, scale: 1, opacity: 0 }
      : enterMode === 'deal'
        ? { x: pose.x, y: pose.y + 90, rotate: pose.rotate, scale: pose.scale, opacity: 0 }
        : { ...pose, opacity: 0 };

  const shaking = isTop && !isRevealed && !reduceMotion && (suspense === 'Epic' || suspense === 'Legendary');

  return (
    <motion.div
      className="absolute inset-0"
      style={{ zIndex: 10 - depth }}
      initial={initial}
      animate={{ ...pose, opacity: depth < DEPTH_POSE.length ? 1 : 0 }}
      exit="fling"
      variants={{
        // `custom` comes from AnimatePresence: { dir, reduce }
        fling: (c: { dir: number; reduce: boolean }) =>
          c.reduce
            ? { opacity: 0, x: c.dir * 60, transition: { duration: 0.2 } }
            : { x: c.dir * 620, y: -90, rotate: c.dir * 34, opacity: 0, transition: { duration: 0.45, ease: [0.4, 0, 1, 1] } },
      }}
      transition={{
        type: 'spring',
        stiffness: 260,
        damping: 26,
        delay: enterMode === 'deal' ? depth * 0.07 : 0,
      }}
      aria-hidden={!isTop}
    >
      {/* Legendary rays behind the card while it charges */}
      <AnimatePresence>
        {isTop && suspense === 'Legendary' && !isRevealed && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, rotate: 0 }}
            animate={reduceMotion ? { opacity: 0.8, scale: 1.6 } : { opacity: 1, scale: 2, rotate: 90 }}
            exit={{ opacity: 0, scale: 2.6 }}
            transition={{ duration: 2, repeat: reduceMotion ? 0 : Infinity, ease: 'linear' }}
            className="absolute inset-0 bg-[conic-gradient(from_0deg,transparent_0deg,rgba(250,204,21,0.4)_10deg,transparent_20deg,rgba(250,204,21,0.4)_30deg,transparent_40deg,rgba(250,204,21,0.4)_50deg,transparent_60deg)] rounded-full blur-xl pointer-events-none -z-10"
          />
        )}
      </AnimatePresence>

      {/* Epic particles while it charges */}
      <AnimatePresence>
        {isTop && suspense === 'Epic' && !isRevealed && !reduceMotion && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute -inset-10 pointer-events-none -z-10">
            {EPIC_PARTICLE_VALUES.map((pv, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
                animate={{ scale: pv.scale, x: pv.x, y: pv.y, opacity: 0, rotate: pv.rotate }}
                transition={{ duration: 1, repeat: Infinity, delay: pv.delay }}
                className="absolute left-1/2 top-1/2 w-2 h-2 bg-purple-400 rounded-sm shadow-[0_0_10px_#a855f7]"
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Afterglow of a Legendary */}
      {isTop && isRevealed && card.rarity === 'Legendary' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1.12 }}
          transition={{ delay: flipS * 0.6 }}
          className="absolute inset-0 bg-yellow-400/30 blur-3xl -z-10 pointer-events-none"
        />
      )}

      {/* Drag layer: a revealed top card can be swiped away */}
      <motion.div
        className={clsx(
          'relative w-full h-full rounded-xl touch-pan-y',
          isTop && 'cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-400/70'
        )}
        style={{ x: dragX, rotate: dragRotate }}
        drag={isTop && isRevealed ? 'x' : false}
        dragSnapToOrigin
        dragElastic={0.6}
        onPointerDown={() => { draggedRef.current = false; }}
        onDragStart={() => { draggedRef.current = true; }}
        onDragEnd={(_, { offset, velocity }) => {
          if (offset.x < -90 || velocity.x < -500) onSwipe(-1);
          else if (offset.x > 90 || velocity.x > 500) onSwipe(1);
        }}
        onClick={() => {
          if (!isTop) return;
          if (draggedRef.current) { draggedRef.current = false; return; }
          onActivate();
        }}
        role={isTop ? 'button' : undefined}
        tabIndex={isTop ? 0 : -1}
        aria-label={isTop ? (isRevealed ? `${card.name}, ${card.rarity}. Next card` : 'Flip the card') : undefined}
      >
        {/* Suspense shake */}
        <motion.div
          className="w-full h-full"
          style={{ perspective: 1000 }}
          animate={
            shaking
              ? suspense === 'Legendary'
                ? { x: [0, -4, 4, -3, 3, 0], y: [0, -2, 2, -2, 2, 0], rotate: [0, -1, 1, -1, 1, 0] }
                : { x: [0, -2, 2, -2, 2, 0], rotate: [0, -0.5, 0.5, 0] }
              : { x: 0, y: 0, rotate: 0 }
          }
          transition={shaking ? { repeat: Infinity, duration: suspense === 'Legendary' ? 0.12 : 0.18 } : { duration: 0.1 }}
        >
          {/* Flip */}
          <motion.div
            className="w-full h-full relative"
            initial={false}
            animate={{ rotateY: isRevealed ? 180 : 0, scale: isRevealed && justRevealed && !reduceMotion && card.rarity === 'Legendary' ? [1, 1.08, 1] : 1 }}
            transition={{ duration: flipS, ease: [0.2, 0.8, 0.25, 1] }}
            style={{ transformStyle: 'preserve-3d' }}
          >
            <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
              <CardBack suspense={isTop && !isRevealed ? suspense : null} />
            </div>

            {(isTop || isRevealed) && (
              <div
                className="absolute inset-0"
                style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              >
                <Card {...card} disableLink />

                {/* Epic reveal sweep */}
                {card.rarity === 'Epic' && justRevealed && !reduceMotion && (
                  <motion.div
                    initial={{ left: '-100%', opacity: 1 }}
                    animate={{ left: '200%', opacity: [1, 1, 0] }}
                    transition={{ duration: 1, ease: 'easeIn', delay: flipS * 0.5 }}
                    className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-white/50 to-transparent skew-x-[-20deg] z-50 pointer-events-none"
                  />
                )}
              </div>
            )}
          </motion.div>
        </motion.div>

        {/* NEW / DUP once face-up */}
        <AnimatePresence>
          {isTop && isRevealed && (
            <motion.div
              className="absolute -top-3 -right-3 z-50"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15, delay: justRevealed ? flipS * 0.8 : 0 }}
            >
              <NewDupBadge card={card} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────

type Stage = 'pack' | 'tearing' | 'cards' | 'summary';

export function BoosterReveal({
  cards,
  packDropFragments,
  onComplete,
  packName = 'Booster',
  packTheme,
}: BoosterRevealProps) {
  const reduceMotion = useReducedMotion();
  const isTouch = useIsTouchDevice();
  const sortedCards = useMemo(() => sortCards(cards), [cards]);

  const [stage, setStage] = useState<Stage>('pack');
  const [currentIndex, setCurrentIndex] = useState(0);
  // Which cards were flipped face-up (kept when bringing a card back)
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [suspense, setSuspense] = useState<{ index: number; rarity: Suspense } | null>(null);
  const [lastRevealed, setLastRevealed] = useState<number | null>(null);
  const [flingDir, setFlingDir] = useState<1 | -1>(-1);
  const [enterMode, setEnterMode] = useState<EnterMode>('deal');
  const [flashKey, setFlashKey] = useState(0);

  const [revealedFor, setRevealedFor] = useState(sortedCards);
  if (revealedFor !== sortedCards) {
    // New pack: reset progress (state adjustment during render, no effect needed)
    setRevealedFor(sortedCards);
    setRevealed([]);
    setCurrentIndex(0);
    setStage('pack');
    setSuspense(null);
    setLastRevealed(null);
    setEnterMode('deal');
  }

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => { preloadBoosterSounds(); }, []);

  const total = sortedCards.length;
  const currentCard = sortedCards[currentIndex] as RevealCard | undefined;
  const isCurrentRevealed = !!revealed[currentIndex];
  const busy = suspense !== null;

  // ── Actions ──

  const tearPack = useCallback(() => {
    if (stage !== 'pack') return;
    playPackTear();
    vibrate(30);
    setStage('tearing');
    later(() => {
      setEnterMode('deal');
      setStage('cards');
    }, reduceMotion ? 150 : 800);
  }, [stage, later, reduceMotion]);

  const skipIntro = useCallback(() => {
    clearTimers();
    setEnterMode('deal');
    setStage('cards');
  }, [clearTimers]);

  const doReveal = useCallback((index: number) => {
    const card = sortedCards[index];
    if (!card) return;
    setSuspense(null);
    setRevealed(prev => {
      if (prev[index]) return prev;
      const next = [...prev];
      next[index] = true;
      return next;
    });
    setLastRevealed(index);
    const flipS = reduceMotion ? FLIP_S_REDUCED : FLIP_S[card.rarity] ?? 0.45;
    // Land the sound when the face shows
    later(() => playCardReveal(card.rarity), flipS * 450);
    if (card.rarity === 'Legendary') {
      later(() => {
        setFlashKey(k => k + 1);
        vibrate([100, 50, 100, 50, 200]);
      }, flipS * 600);
    } else if (card.rarity === 'Epic' || card.rarity === 'Rare') {
      later(() => vibrate(50), flipS * 500);
    }
  }, [sortedCards, reduceMotion, later]);

  const flipTop = useCallback(() => {
    if (stage !== 'cards' || busy || !currentCard || revealed[currentIndex]) return;
    const s = suspenseFor(currentCard.rarity);
    const pause = s ? (reduceMotion ? SUSPENSE_MS_REDUCED : SUSPENSE_MS)[s] : 0;
    vibrate(20);
    if (s && pause > 0) {
      const index = currentIndex;
      setSuspense({ index, rarity: s });
      if (s !== 'Rare') playSuspenseRiser(pause / 1000, s === 'Legendary');
      later(() => doReveal(index), pause);
    } else {
      doReveal(currentIndex);
    }
  }, [stage, busy, currentCard, revealed, currentIndex, reduceMotion, later, doReveal]);

  const goToSummary = useCallback(() => {
    clearTimers();
    setSuspense(null);
    setStage('summary');
  }, [clearTimers]);

  const flingTop = useCallback((dir: 1 | -1) => {
    if (stage !== 'cards' || busy || !revealed[currentIndex]) return;
    setFlingDir(dir);
    setEnterMode('forward');
    playCardFling();
    const next = currentIndex + 1;
    setCurrentIndex(next);
    if (next >= total) later(goToSummary, reduceMotion ? 220 : 480);
  }, [stage, busy, revealed, currentIndex, total, later, goToSummary, reduceMotion]);

  const bringBack = useCallback(() => {
    if (stage !== 'cards' || busy || currentIndex === 0) return;
    setEnterMode('back');
    setFlingDir(1); // whatever falls off the pile meanwhile leaves to the right
    setCurrentIndex(i => i - 1);
  }, [stage, busy, currentIndex]);

  const activateTop = useCallback(() => {
    if (revealed[currentIndex]) flingTop(-1);
    else flipTop();
  }, [revealed, currentIndex, flingTop, flipTop]);

  const revealAll = useCallback(() => {
    clearTimers();
    setSuspense(null);
    setRevealed(sortedCards.map(() => true));
    const best = sortedCards[sortedCards.length - 1];
    if (best) playCardReveal(best.rarity);
    setCurrentIndex(sortedCards.length);
    setStage('summary');
  }, [clearTimers, sortedCards]);

  // ── Keyboard: Space/Enter flip or throw, → next, ← bring the last card back ──
  useEffect(() => {
    if (stage === 'summary') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      // Let focused buttons/links handle their own Space/Enter
      if (target instanceof Element && target.closest('button, a, input, textarea, select')) {
        if (e.key === ' ' || e.key === 'Enter') return;
      }
      if (stage === 'pack') {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          tearPack();
        }
        return;
      }
      if (stage !== 'cards') return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        activateTop();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        flingTop(-1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        bringBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, tearPack, activateTop, flingTop, bringBack]);

  // ── Summary screen ──
  if (stage === 'summary') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-7xl mx-auto space-y-12 z-20 pb-20 pt-10 px-4"
      >
        <div className="text-center">
          <h2 className="text-5xl font-black text-white tracking-tight drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] mb-3 uppercase">
            Pack Summary
          </h2>
          <p className="text-slate-300 uppercase tracking-widest text-sm font-semibold">All revealed cards from this booster</p>
        </div>

        {packDropFragments && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-8 text-center"
          >
            <div className="inline-flex items-center gap-3 bg-slate-900/80 backdrop-blur-md px-6 py-3 rounded-2xl border border-amber-500/50 shadow-[0_4px_20px_rgba(245,158,11,0.3),inset_0_1px_1px_rgba(255,255,255,0.1)]">
              <Sparkle size={24} weight="fill" className="text-amber-400 animate-pulse" />
              <span className="font-bold text-slate-200 text-lg">
                Bonus: <span className="text-amber-400 font-black text-xl drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]">+{packDropFragments.amount}</span> {packDropFragments.language} Fragments!
              </span>
            </div>
          </motion.div>
        )}

        <div className="flex flex-wrap justify-center gap-6 mt-8">
          {sortedCards.map((c, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1, type: 'spring' }}
              className="relative"
            >
              <Card {...c} />
              <NewDupBadge card={c} className="absolute -top-3 -right-3 z-50" />
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: sortedCards.length * 0.1 + 0.3 }}
          className="text-center pt-8"
        >
          <div className="mb-6 font-bold text-yellow-500">+50 XP</div>
          <button
            onClick={onComplete}
            className="px-10 py-4 rounded-2xl bg-slate-100 hover:bg-white border border-white text-slate-900 font-extrabold tracking-[0.15em] text-sm uppercase transition-all shadow-[0_4px_20px_rgba(255,255,255,0.3),inset_0_2px_4px_rgba(255,255,255,1)] hover:shadow-[0_8px_30px_rgba(255,255,255,0.5)] hover:-translate-y-1 active:translate-y-0 active:shadow-md"
          >
            Add to collection
          </button>
        </motion.div>
      </motion.div>
    );
  }

  // ── Pack / stack phases ──
  const inPack = stage === 'pack' || stage === 'tearing';
  const unrevealedLeft = sortedCards.filter((_, i) => i >= currentIndex && !revealed[i]).length;
  const stackCards = sortedCards
    .map((c, i) => ({ c, i }))
    .slice(currentIndex)
    .reverse(); // deepest first in the DOM, top card painted last

  let hint: string;
  if (inPack) hint = isTouch ? 'Tap the pack to tear it open' : 'Click the pack or press Space to tear it open';
  else if (busy) hint = suspense?.rarity === 'Legendary' ? 'Something big is coming…' : suspense?.rarity === 'Epic' ? 'Feels special…' : '…';
  else if (!isCurrentRevealed) hint = isTouch ? 'Tap the card to flip it' : 'Click or press Space to flip';
  else hint = isTouch ? 'Tap or swipe to throw it aside' : 'Click, Space or → for the next card';

  const caption =
    !inPack && currentCard && isCurrentRevealed
      ? currentCard.isDuplicate
        ? `Duplicate · +${currentCard.fragmentsEarned ?? 0} ${currentCard.primaryLanguage || ''} fragments`
        : 'New card for your collection!'
      : null;

  return (
    <div className="relative w-full max-w-5xl mx-auto flex flex-col items-center gap-5 py-4 overscroll-none">
      {/* Legendary charge: dim the page */}
      <AnimatePresence>
        {suspense?.rarity === 'Legendary' && (
          <motion.div
            key="dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 pointer-events-none z-0"
          />
        )}
      </AnimatePresence>
      {/* Legendary reveal flash */}
      {flashKey > 0 && (
        <motion.div
          key={flashKey}
          initial={{ opacity: reduceMotion ? 0.25 : 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.4 : 0.9 }}
          className="fixed inset-0 bg-yellow-100 pointer-events-none z-[100]"
        />
      )}

      {/* Progress: one pip per card, rarity shown once revealed */}
      <div className="relative z-10 flex items-center gap-3 bg-slate-900/60 px-4 py-2 rounded-full border border-slate-700/50 backdrop-blur-md">
        <div className="flex items-center gap-1.5" aria-hidden>
          {sortedCards.map((c, i) => (
            <span key={i} className={clsx('flex items-center justify-center w-4 h-4', !inPack && i === currentIndex && 'scale-125')}>
              {revealed[i] ? (
                <RarityGem rarity={c.rarity} size={14} title="" />
              ) : (
                <span className={clsx('block w-2 h-2 rounded-full', !inPack && i === currentIndex ? 'bg-slate-200' : 'bg-slate-600')} />
              )}
            </span>
          ))}
        </div>
        <span className="text-slate-400 font-bold tracking-widest text-xs" aria-live="polite">
          {inPack ? `${total} cards` : `${Math.min(currentIndex + 1, total)} / ${total}`}
        </span>
      </div>

      {/* Stage */}
      <div className="relative z-10 w-full min-h-[440px] flex items-center justify-center">
        {inPack ? (
          <BoosterPack
            name={packName}
            theme={packTheme}
            cardCount={total}
            tearing={stage === 'tearing'}
            onTear={tearPack}
          />
        ) : (
          <>
            {/* Desktop side buttons */}
            <button
              onClick={bringBack}
              disabled={currentIndex === 0 || busy}
              aria-label="Bring back the previous card"
              className="hidden md:flex absolute left-10 top-1/2 -translate-y-1/2 p-4 rounded-full bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 transition-colors z-40 shadow-xl"
            >
              <CaretLeft size={32} weight="bold" className="text-white" />
            </button>
            <button
              onClick={() => flingTop(-1)}
              disabled={!isCurrentRevealed || busy}
              aria-label={currentIndex === total - 1 ? 'View pack summary' : 'Next card'}
              title={isCurrentRevealed ? undefined : 'Flip this card first'}
              className={clsx(
                'hidden md:flex absolute right-10 top-1/2 -translate-y-1/2 p-4 rounded-full bg-slate-800 hover:bg-slate-700 transition-colors z-40 shadow-xl group',
                'disabled:opacity-30 disabled:hover:bg-slate-800 disabled:cursor-not-allowed',
                isCurrentRevealed && !busy && 'animate-pulse motion-reduce:animate-none'
              )}
            >
              <CaretRight size={32} weight="bold" className="text-white group-hover:translate-x-1 transition-transform" />
            </button>

            {/* The pile */}
            <div className="relative w-64 h-[410px]">
              <AnimatePresence custom={{ dir: flingDir, reduce: !!reduceMotion }}>
                {stackCards.map(({ c, i }) => (
                  <StackCard
                    key={i}
                    card={c}
                    depth={i - currentIndex}
                    isRevealed={!!revealed[i]}
                    suspense={suspense && suspense.index === i ? suspense.rarity : null}
                    justRevealed={lastRevealed === i}
                    enterMode={enterMode}
                    onActivate={activateTop}
                    onSwipe={flingTop}
                  />
                ))}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      {/* Hint / caption */}
      <div className="relative z-10 min-h-[48px] flex flex-col items-center justify-center gap-2 px-4 text-center">
        {caption && (
          <div className={clsx('text-sm font-bold', currentCard?.isDuplicate ? 'text-rose-300' : 'text-emerald-300')}>{caption}</div>
        )}
        <div className="text-slate-300 text-xs tracking-widest uppercase font-bold bg-slate-900/60 border border-white/10 px-6 py-3 rounded-full backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          {hint}
        </div>
      </div>

      {/* Controls */}
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-3 px-4">
        {inPack && (
          <button
            onClick={skipIntro}
            disabled={stage === 'tearing'}
            className="px-5 py-2.5 rounded-full bg-slate-800/80 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-bold tracking-widest uppercase transition-colors disabled:opacity-40"
          >
            Skip intro
          </button>
        )}
        {!inPack && (
          <button
            onClick={() => flingTop(-1)}
            disabled={!isCurrentRevealed || busy}
            className="md:hidden px-5 py-2.5 rounded-full bg-slate-800 border border-slate-600 text-white text-xs font-bold tracking-widest uppercase shadow-lg transition-opacity disabled:opacity-0 disabled:pointer-events-none"
          >
            {currentIndex === total - 1 ? 'View summary' : 'Next card'}
          </button>
        )}
        <button
          onClick={revealAll}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-indigo-600/90 hover:bg-indigo-500 border border-indigo-400/60 text-white text-xs font-black tracking-widest uppercase shadow-[0_0_18px_rgba(79,70,229,0.35)] transition-colors"
        >
          Reveal all{!inPack && unrevealedLeft > 0 ? ` (${unrevealedLeft})` : ''}
          <FastForward size={14} weight="bold" />
        </button>
      </div>
    </div>
  );
}
