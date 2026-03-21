'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardProps } from '@/components/Card';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkle, CaretLeft, CaretRight } from '@phosphor-icons/react';
import clsx from 'clsx';

interface BoosterRevealProps {
  cards: (CardProps & { isDuplicate?: boolean; fragmentsEarned?: number })[];
  packDropFragments: { language: string; amount: number } | null;
  onComplete: () => void;
}

const RARITY_VALUES: Record<string, number> = {
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  Epic: 4,
  Legendary: 5,
};

function sortCards(cards: BoosterRevealProps['cards']) {
  return [...cards].sort((a, b) => {
    const valA = RARITY_VALUES[a.rarity] || 0;
    const valB = RARITY_VALUES[b.rarity] || 0;
    return valA - valB;
  });
}

// Pre-computed random values for epic particle effects (module-level, outside render)
const EPIC_PARTICLE_VALUES = Array.from({ length: 6 }, () => ({
  scale: Math.random() * 2 + 1,
  x: (Math.random() - 0.5) * 150,
  y: (Math.random() - 0.5) * 150,
  rotate: Math.random() * 360,
  delay: Math.random(),
}));

// Subcomponent for each flippable card
function FlippableCard({
  card,
}: {
  card: CardProps & { isDuplicate?: boolean; fragmentsEarned?: number };
}) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const [anticipationPhase, setAnticipationPhase] = useState<string | null>(null);

  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

  useEffect(() => {
    if (!card.isShiny) return;
    
    const handleDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) {
        // gamma is left/right roughly -90 to 90
        // beta is front/back roughly -180 to 180
        const x = Math.min(Math.max((e.gamma + 90) / 180 * 100, 0), 100);
        const y = Math.min(Math.max((e.beta + 90) / 180 * 100, 0), 100);
        setMousePos({ x, y });
      }
    };

    if (typeof window !== 'undefined' && window.DeviceOrientationEvent && 'ontouchstart' in window) {
      window.addEventListener('deviceorientation', handleDeviceOrientation);
      return () => window.removeEventListener('deviceorientation', handleDeviceOrientation);
    }
  }, [card.isShiny]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!card.isShiny || ('ontouchstart' in window)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x, y });
  };

  const handleClick = () => {
    if (isFlipped || isFlipping) return;
    setIsFlipping(true);

    const rarity = card.rarity;
    
    let pause = 0;

    if (rarity === 'Legendary') {
      pause = 1500;
      setAnticipationPhase('Legendary');
    } else if (rarity === 'Epic') {
      pause = 1000;
      setAnticipationPhase('Epic');
    } else if (rarity === 'Rare') {
      pause = 600;
      setAnticipationPhase('Rare');
    } else {
      setAnticipationPhase('Common');
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(20);
    }

    setTimeout(() => {
      setIsFlipped(true);
      if (rarity === 'Legendary') {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([100, 50, 100, 50, 200]);
        }
      } else if (rarity === 'Epic' || rarity === 'Rare') {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(50);
        }
      }
    }, pause);
  };

  // Drag constraints helper
  // Hold-to-zoom logic
  const touchStartTimer = useRef<NodeJS.Timeout | null>(null);

  const startHold = () => {
    if (!isFlipped) return;
    touchStartTimer.current = setTimeout(() => {
      setIsPressing(true);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(15);
      }
    }, 300); // 300ms to consider a hold
  };

  const endHold = () => {
    if (touchStartTimer.current) clearTimeout(touchStartTimer.current);
    setIsPressing(false);
  };

  const isLegendaryAntic = anticipationPhase === 'Legendary';
  const isEpicAntic = anticipationPhase === 'Epic';
  const isRareAntic = anticipationPhase === 'Rare';

  return (
    <motion.div
      className={clsx(
        "relative w-64 h-[410px] select-none flex items-center justify-center",
        isPressing ? "z-[100]" : "z-10"
      )}
      initial={false}
      animate={{
        scale: isPressing ? 1.5 : 1,
        y: isFlipped && card.rarity === 'Legendary' && !isPressing ? -15 : 0, 
      }}
      transition={{ 
        scale: { type: 'spring', stiffness: 300, damping: 20 },
        y: { type: 'spring', stiffness: 100, damping: 10 }
      }}
      onMouseMove={handleMouseMove}
      onMouseDown={startHold}
      onMouseUp={endHold}
      onMouseLeave={endHold}
      onTouchStart={startHold}
      onTouchEnd={endHold}
    >
      {/* Background Darkening for Legendary Anticipation */}
      <AnimatePresence>
        {isLegendaryAntic && !isFlipped && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[-1] pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Epic Particles */}
      <AnimatePresence>
        {isEpicAntic && !isFlipped && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-[-40px] pointer-events-none z-[-1]"
          >
            {EPIC_PARTICLE_VALUES.map((pv, i) => (
              <motion.div
                key={i}
                initial={{ 
                  scale: 0, 
                  x: 0, 
                  y: 0, 
                  opacity: 1 
                }}
                animate={{ 
                  scale: pv.scale, 
                  x: pv.x, 
                  y: pv.y, 
                  opacity: 0,
                  rotate: pv.rotate
                }}
                transition={{ duration: 1, repeat: Infinity, delay: pv.delay }}
                className="absolute left-1/2 top-1/2 w-2 h-2 bg-purple-400 rounded-sm shadow-[0_0_10px_#a855f7]"
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legendary Screen Shake Wrapper */}
      <motion.div
        className="relative w-64 h-[410px]"
        animate={
          isLegendaryAntic && !isFlipped ? { 
            x: [0, -4, 4, -4, 4, 0], 
            y: [0, -3, 3, -3, 3, 0],
            rotate: [0, -1, 1, -1, 1, 0] 
          } : {}
        }
        transition={{ repeat: Infinity, duration: 0.1 }}
      >
        {/* Legendary Golden Rays (behind card) */}
        <AnimatePresence>
          {isLegendaryAntic && !isFlipped && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5, rotate: 0 }}
              animate={{ opacity: 1, scale: 2, rotate: 90 }}
              exit={{ opacity: 0, scale: 3, rotate: 180 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 bg-[conic-gradient(from_0deg,transparent_0deg,rgba(250,204,21,0.4)_10deg,transparent_20deg,rgba(250,204,21,0.4)_30deg,transparent_40deg,rgba(250,204,21,0.4)_50deg,transparent_60deg)] rounded-full blur-xl pointer-events-none z-[-1]"
              style={{ padding: '50%' }}
            />
          )}
        </AnimatePresence>

        {/* Post-Legendary Glow */}
        {isFlipped && card.rarity === 'Legendary' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1.1 }}
            className="absolute inset-0 bg-yellow-400/30 blur-3xl z-[-1]"
          />
        )}

        <motion.div
          className="relative w-full h-full cursor-pointer transform-gpu perspective-1000"
          onClick={handleClick}
        >
          {/* Card Flop Container */}
          <motion.div
            className="w-full h-full relative preserve-3d"
            animate={{ rotateY: isFlipped ? 180 : 0 }}
            transition={{ 
              duration: 
                anticipationPhase === 'Legendary' ? 0.8 : 
                anticipationPhase === 'Epic' ? 0.6 : 
                anticipationPhase === 'Rare' ? 0.5 : 0.4,
              ease: "circOut"
            }}
            style={{ transformStyle: 'preserve-3d' }}
          >
            {/* BACK of the card (rotateY = 0) */}
            <div 
              className="absolute inset-0 backface-hidden"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <div 
                className={clsx(
                  "w-full h-full rounded-xl border-[6px] border-slate-700 bg-slate-900 shadow-xl flex items-center justify-center relative overflow-hidden transition-all duration-300",
                  isRareAntic && !isFlipped && "shadow-[0_0_30px_rgba(59,130,246,0.6)] border-blue-400",
                  isEpicAntic && !isFlipped && "shadow-[0_0_40px_rgba(168,85,247,0.8)] border-purple-500",
                  isLegendaryAntic && !isFlipped && "shadow-[0_0_50px_rgba(250,204,21,1)] border-yellow-300"
                )}
              >
                {/* Generic Card Back Pattern */}
                <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] pointer-events-none" />
                <div className="absolute inset-2 border-2 border-dashed border-slate-600 rounded-lg pointer-events-none" />
                
                <div className={clsx(
                  "relative z-10 font-black text-4xl transform -rotate-12 italic tracking-tighter drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] [text-shadow:0_2px_0_#94a3b8,0_4px_0_#475569,0_6px_0_#0f172a,0_8px_10px_rgba(0,0,0,0.8)]",
                  isLegendaryAntic ? "text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 to-yellow-600 font-bold drop-shadow-[0_0_20px_rgba(250,204,21,1)]" : "text-transparent bg-clip-text bg-gradient-to-b from-slate-200 to-slate-500"
                )}>
                  GITGACHA
                </div>
              </div>
            </div>

            {/* FRONT of the card (rotateY = 180) */}
            <div 
              className="absolute inset-0 backface-hidden w-full h-full flex items-center justify-center"
              style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            >
              <div className="relative w-full h-full">
                {/* The Front face is rendered only when flipped starts? framer handles backface visibility perfectly. */}
                <Card {...card} disableLink />
                
                {/* Shiny Foil Holographic Shimmer Layer */}
                {card.isShiny && isFlipped && (
                  <div 
                    className="absolute inset-0 pointer-events-none rounded-xl z-[60] mix-blend-color-dodge transition-opacity duration-300"
                    style={{
                      background: `radial-gradient(
                        circle at ${mousePos.x}% ${mousePos.y}%, 
                        rgba(255,255,255,0.8) 0%, 
                        rgba(255,255,255,0) 60%
                      )`,
                      opacity: 0.6
                    }}
                  />
                )}
                {card.isShiny && isFlipped && (
                  <div 
                    className="absolute inset-0 pointer-events-none rounded-xl z-[60] mix-blend-overlay transition-opacity duration-300"
                    style={{
                      background: `linear-gradient(
                        ${mousePos.x + mousePos.y}deg, 
                        rgba(255,100,200,0) 0%, 
                        rgba(100,200,255,0.4) 40%, 
                        rgba(255,255,200,0.5) 50%, 
                        rgba(255,100,200,0.4) 60%, 
                        rgba(200,200,255,0) 100%
                      )`,
                    }}
                  />
                )}

                {/* Epic Reveal Sweep Effect */}
                {card.rarity === 'Epic' && isFlipped && (
                  <motion.div
                    initial={{ left: '-100%', opacity: 1 }}
                    animate={{ left: '200%', opacity: [1, 1, 0] }}
                    transition={{ duration: 1, ease: 'easeIn' }}
                    className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-white/50 to-transparent skew-x-[-20deg] z-[50] pointer-events-none"
                  />
                )}

                {/* Legendary Reveal Screen Flash & Confetti */}
                <AnimatePresence>
                  {card.rarity === 'Legendary' && isFlipped && (
                    <motion.div
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 0 }}
                      transition={{ duration: 0.8 }}
                      className="fixed inset-[-200%] bg-yellow-100 z-[100] pointer-events-none"
                    />
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export function BoosterReveal({
  cards,
  packDropFragments,
  onComplete,
}: BoosterRevealProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Sort cards once
  const sortedCards = useMemo(() => sortCards(cards), [cards]);
  const isSummaryPhase = currentIndex === sortedCards.length;

  const handleNext = () => {
    if (currentIndex < sortedCards.length) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  // Summary Screen rendering
  if (isSummaryPhase) {
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
          {sortedCards.map((c: CardProps & { isDuplicate?: boolean; fragmentsEarned?: number }, i: number) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1, type: "spring" }}
              className="relative"
            >
              <Card {...c} />
              {c.isDuplicate ? (
                <div className="absolute -top-3 -right-3 bg-slate-900/90 backdrop-blur-xl text-rose-400 text-xs font-black px-3 py-1.5 rotate-12 z-20 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.2)] border border-rose-500/50 rounded-full pointer-events-none tracking-widest uppercase">
                  DUP <span className="text-rose-300 drop-shadow-[0_0_4px_rgba(244,63,94,0.8)]">+{c.fragmentsEarned}</span>
                </div>
              ) : (
                <div className="absolute -top-3 -right-3 bg-slate-900/90 backdrop-blur-xl text-emerald-400 text-[10px] font-black px-3 py-1.5 -rotate-12 z-20 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.2)] border border-emerald-500/50 rounded-full pointer-events-none tracking-widest uppercase">
                  NEW
                </div>
              )}
            </motion.div>
          ))}
        </div>
        
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ delay: sortedCards.length * 0.1 + 0.3 }}
          className="text-center pt-8"
        >
          <div className="mb-6 font-bold text-yellow-500">
            +50 XP
          </div>
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

  // Single card reveal phase
  const currentCard = sortedCards[currentIndex];

  return (
    <div className="relative w-full max-w-5xl mx-auto min-h-[60vh] flex flex-col items-center justify-center overscroll-none touch-none">
      <div className="absolute top-4 w-full flex justify-between px-6 items-center z-50">
        <div className="text-slate-400 font-bold tracking-widest text-sm bg-slate-900/50 px-4 py-2 rounded-full border border-slate-700/50 backdrop-blur-md">
          {currentIndex + 1} / {sortedCards.length}
        </div>
      </div>

      <div className="relative w-full flex-1 flex items-center justify-center">
        {/* Navigation Buttons (Desktop mainly) */}
        <button 
          onClick={handlePrev} 
          disabled={currentIndex === 0}
          className="hidden md:flex absolute left-10 p-4 rounded-full bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 transition-colors z-40 shadow-xl"
        >
          <CaretLeft size={32} weight="bold" className="text-white" />
        </button>

        <button 
          onClick={handleNext} 
          className="hidden md:flex absolute right-10 p-4 rounded-full bg-slate-800 hover:bg-slate-700 transition-colors z-40 shadow-xl animate-pulse cursor-pointer group"
        >
          <CaretRight size={32} weight="bold" className="text-white group-hover:translate-x-1 transition-transform" />
        </button>

        {/* Swipeable Container */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            className="w-full h-full flex items-center justify-center absolute inset-0 touch-none py-10"
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -100, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(e, { offset, velocity }) => {
              if (offset.x < -80 || velocity.x < -400) {
                handleNext();
              } else if (offset.x > 80 || velocity.x > 400) {
                handlePrev();
              }
            }}
          >
            <FlippableCard key={currentIndex} card={currentCard} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="absolute bottom-8 text-slate-300 text-xs tracking-widest uppercase font-bold z-40 bg-slate-900/60 border border-white/10 px-6 py-3 rounded-full backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        Tap to reveal • Swipe or click arrows to navigate
      </div>
    </div>
  );
}
