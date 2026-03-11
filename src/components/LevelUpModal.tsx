'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Sparkle, Confetti, Star } from '@phosphor-icons/react';

interface LevelUpReward {
  level: number;
  packId: string;
  packName: string;
  tier: 'Common' | 'Rare' | 'Epic';
}

interface XPResult {
  previousLevel: number;
  newLevel: number;
  levelUps: LevelUpReward[];
}

interface LevelUpModalProps {
  xpResult: XPResult;
  onClose: () => void;
}

export function LevelUpModal({ xpResult, onClose }: LevelUpModalProps) {
  if (!xpResult || xpResult.levelUps.length === 0) return null;

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'Epic': return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
      case 'Rare': return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      default: return 'text-slate-300 bg-slate-600/10 border-slate-600/30';
    }
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
      >
        <motion.div 
          initial={{ scale: 0.5, opacity: 0, y: 50 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", bounce: 0.5, duration: 0.8 }}
          className="bg-slate-900 border-2 border-yellow-500/50 rounded-[2rem] p-8 md:p-12 max-w-2xl w-full shadow-[0_0_100px_rgba(234,179,8,0.2)] text-center relative overflow-hidden"
        >
          {/* Confetti Background FX */}
          <div className="absolute inset-0 pointer-events-none opacity-20">
            <div className="absolute top-10 left-10 w-32 h-32 bg-yellow-500 rounded-full blur-[100px]" />
            <div className="absolute bottom-10 right-10 w-32 h-32 bg-purple-500 rounded-full blur-[100px]" />
          </div>

          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.3, type: "spring" }}
            className="w-24 h-24 mx-auto bg-gradient-to-br from-yellow-400 to-amber-600 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(250,204,21,0.6)] border-4 border-white/20 mb-8"
          >
            <Star weight="fill" className="text-white text-5xl drop-shadow-md" />
          </motion.div>

          <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 mb-2">
            LEVEL UP!
          </h2>
          <p className="text-2xl text-yellow-400 font-bold mb-8">
            You reached Level {xpResult.newLevel}
          </p>

          <div className="bg-slate-950/50 rounded-2xl p-6 border border-white/5 mb-8">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-4">Rewards Added to Inventory</h3>
            <div className="flex flex-col gap-3">
              {xpResult.levelUps.map((reward, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + i * 0.1 }}
                  className={`flex items-center justify-between p-4 rounded-xl border ${getTierColor(reward.tier)}`}
                >
                  <div className="flex items-center gap-3 font-bold">
                    <Sparkle weight="fill" className={reward.tier === 'Epic' ? 'text-purple-400' : reward.tier === 'Rare' ? 'text-blue-400' : 'text-slate-400'} />
                    {reward.packName}
                  </div>
                  <div className="text-xs font-black uppercase tracking-widest px-2 py-1 bg-black/40 rounded">
                    {reward.tier}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-600 text-white font-black text-lg shadow-[0_10px_30px_-10px_rgba(245,158,11,0.5)] border border-yellow-400/50"
          >
            Awesome!
          </motion.button>

        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
