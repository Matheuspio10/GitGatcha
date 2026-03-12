'use client';

import { useState, useEffect } from 'react';
import { Sparkle, Star, Coins, Checks } from '@phosphor-icons/react';

interface PackReward {
  packIds: string[];
  packNames: string[];
  coins: number;
}

interface LevelUpReward extends PackReward {
  level: number;
  badge?: string;
}

export function LevelUpModal() {
  const [pendingRewards, setPendingRewards] = useState<LevelUpReward[]>([]);
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Fetch pending rewards on mount
  useEffect(() => {
    const fetchPending = async () => {
      try {
        const res = await fetch('/api/notifications');
        if (res.ok) {
          const data = await res.json();
          if (data.pendingRewards && data.pendingRewards.length > 0) {
            // Sort by level ascending so they see progression
            const sorted = data.pendingRewards.sort((a: LevelUpReward, b: LevelUpReward) => a.level - b.level);
            setPendingRewards(sorted);
          }
        }
      } catch (err) {
        console.error('Failed to fetch pending rewards', err);
      }
    };
    
    const timer = setTimeout(fetchPending, 1000);
    return () => clearTimeout(timer);
  }, []);

  if (pendingRewards.length === 0) return null;

  const handleNext = () => {
    if (currentLevelIndex < pendingRewards.length - 1) {
      setCurrentLevelIndex(prev => prev + 1);
    } else {
      setShowSummary(true);
    }
  };

  const handleClaim = async () => {
    setIsClosing(true);
    try {
      await fetch('/api/rewards/claim', { method: 'POST' });
      
      // Give time for exit animation
      setTimeout(() => {
        setPendingRewards([]);
        setCurrentLevelIndex(0);
        setShowSummary(false);
        setIsClosing(false);
      }, 500);
    } catch (err) {
      console.error('Failed to claim rewards', err);
      setIsClosing(false);
    }
  };

  const currentReward = pendingRewards[currentLevelIndex];
  
  // Combine all rewards for summary screen
  const allPackNames = pendingRewards.flatMap(r => r.packNames);
  const totalCoins = pendingRewards.reduce((sum, r) => sum + r.coins, 0);

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 transition-opacity duration-500 ${isClosing ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
      
      {/* Burst Particles Background Effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-tr from-indigo-500/20 via-purple-500/20 to-yellow-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-yellow-400/20 rounded-full blur-2xl animate-ping opacity-50 shadow-[0_0_100px_rgba(250,204,21,0.5)]"></div>
      </div>

      <div className={`relative bg-slate-900 border-2 border-yellow-500/50 rounded-none sm:rounded-[2rem] p-8 md:p-12 w-full sm:max-w-lg h-full sm:h-auto overflow-y-auto sm:overflow-visible shadow-[0_0_50px_rgba(234,179,8,0.3)] transition-transform duration-500 ${isClosing ? 'scale-90 translate-y-10' : 'scale-100 translate-y-0'}`}>
        
        {/* Header Ribbon */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600"></div>

        {!showSummary ? (
          <div className="text-center animate-in zoom-in duration-500">
            <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-widest flex items-center justify-center gap-2">
              <Sparkle className="text-yellow-400" />
              Level Up!
              <Sparkle className="text-yellow-400" />
            </h2>
            
            <div className="relative flex justify-center items-center my-8">
              <div className="absolute inset-0 bg-yellow-500/20 blur-xl rounded-full scale-150"></div>
              <div className="relative z-10 w-32 h-32 rounded-full border-4 border-yellow-400 bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center shadow-[0_0_30px_rgba(250,204,21,0.5)]">
                <span className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 to-yellow-500 drop-shadow-md">
                  {currentReward.level}
                </span>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <h3 className="text-lg font-bold text-slate-300">Rewards Unlocked</h3>
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <div className="flex flex-col gap-3">
                  {currentReward.packNames.map((packName, i) => (
                    <div key={i} className="flex items-center gap-3 text-left">
                      <div className="w-10 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded drop-shadow-md border border-white/20 flex flex-shrink-0 items-center justify-center">
                        <Star size={18} weight="fill" className="text-yellow-300" />
                      </div>
                      <span className="font-bold text-white flex-1">{packName} Booster</span>
                    </div>
                  ))}
                  
                  {currentReward.coins > 0 && (
                    <div className="flex items-center gap-3 text-left">
                      <div className="w-10 h-10 bg-yellow-500/20 rounded-full border border-yellow-500/50 flex flex-shrink-0 items-center justify-center">
                        <Coins size={20} weight="fill" className="text-yellow-400" />
                      </div>
                      <span className="font-bold text-yellow-400 flex-1">+{currentReward.coins} Bits</span>
                    </div>
                  )}

                  {currentReward.badge && (
                    <div className="flex items-center gap-3 text-left">
                      <div className="w-10 h-10 bg-purple-500/20 rounded-full border border-purple-500/50 flex flex-shrink-0 items-center justify-center">
                        <Sparkle size={20} weight="fill" className="text-purple-400" />
                      </div>
                      <span className="font-bold text-purple-400 flex-1">{currentReward.badge} Badge</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button 
              onClick={handleNext}
              className="w-full py-4 rounded-xl font-black text-lg bg-gradient-to-r from-yellow-400 to-amber-600 text-slate-900 border-b-4 border-amber-700 hover:brightness-110 hover:-translate-y-1 active:border-b-0 active:translate-y-1 transition-all shadow-lg"
            >
              {currentLevelIndex < pendingRewards.length - 1 ? 'Next Level ➔' : (pendingRewards.length > 1 ? 'View Summary' : 'Claim Rewards')}
            </button>
            
            {pendingRewards.length > 1 && (
              <p className="text-xs text-slate-500 mt-4 font-bold tracking-wider">
                {currentLevelIndex + 1} of {pendingRewards.length} LEVELS
              </p>
            )}
          </div>
        ) : (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-black text-white mb-6 uppercase tracking-widest">
              Total Haul
            </h2>
            
            <div className="bg-slate-800/80 rounded-2xl p-5 border border-slate-700 mb-8 max-h-[50vh] overflow-y-auto custom-scrollbar">
              <p className="text-sm font-bold text-slate-400 mb-4 tracking-wider uppercase">
                Levels {pendingRewards[0].level} - {pendingRewards[pendingRewards.length - 1].level}
              </p>
              
              <div className="flex flex-col gap-3">
                {allPackNames.map((packName, i) => (
                  <div key={i} className="flex items-center gap-3 text-left bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                    <div className="w-8 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded flex items-center justify-center border border-white/20">
                      <Star size={14} weight="fill" className="text-yellow-300" />
                    </div>
                    <span className="font-bold text-sm text-slate-200">{packName}</span>
                  </div>
                ))}
                
                {totalCoins > 0 && (
                  <div className="flex items-center gap-3 text-left bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/20">
                    <div className="w-8 h-8 bg-yellow-500/20 rounded-full flex items-center justify-center border border-yellow-500/50">
                      <Coins size={16} weight="fill" className="text-yellow-400" />
                    </div>
                    <span className="font-bold text-sm text-yellow-400">+{totalCoins} Total Bits</span>
                  </div>
                )}
              </div>
            </div>

            <button 
              onClick={handleClaim}
              className="w-full py-4 rounded-xl font-black text-lg bg-gradient-to-r from-yellow-400 to-amber-600 text-slate-900 border-b-4 border-amber-700 hover:brightness-110 hover:-translate-y-1 active:border-b-0 active:translate-y-1 transition-all shadow-lg overflow-hidden relative group"
            >
              <div className="absolute inset-0 w-1/4 h-full bg-white/30 skew-x-[-20deg] -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
              <span className="relative z-10 flex items-center justify-center gap-2">
                Claim All <Checks weight="bold" />
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
