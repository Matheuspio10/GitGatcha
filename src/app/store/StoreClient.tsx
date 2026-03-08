'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardProps } from '@/components/Card';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { 
  Code, 
  Trophy, 
  Hourglass, 
  Buildings, 
  Globe, 
  Sparkle,
  Coin,
  Gift,
  CheckCircle,
  Circle
} from '@phosphor-icons/react';

interface PackVisualTheme {
  gradient: string;
  border: string;
  textColor: string;
  accentColor: string;
  animated?: boolean;
}

interface PackInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  cardCount: number;
  cost: number;
  visualTheme: PackVisualTheme;
  guaranteedMinRarity: string | null;
  allCommon?: boolean;
  noPreview?: boolean;
}

interface CategoryInfo {
  key: string;
  label: string;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  language: <Code weight="bold" />,
  contributor: <Trophy weight="bold" />,
  era: <Hourglass weight="bold" />,
  company: <Buildings weight="bold" />,
  regional: <Globe weight="bold" />,
  rarity: <Sparkle weight="bold" />,
};

function getRarityBadgeColor(rarity: string | null): string {
  switch (rarity) {
    case 'Legendary': return '#ffd700';
    case 'Epic': return '#a855f7';
    case 'Rare': return '#3b82f6';
    default: return '';
  }
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Ready!';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

export default function StoreClient({ 
  userCurrency,
  initialMissions 
}: { 
  userCurrency: number;
  initialMissions: any[];
}) {
  const [loading, setLoading] = useState(false);
  const [packState, setPackState] = useState<'IDLE' | 'SHAKING' | 'EXPLODED'>('IDLE');
  const [cards, setCards] = useState<CardProps[]>([]);
  const [currency, setCurrency] = useState(userCurrency);
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [selectedPack, setSelectedPack] = useState<PackInfo | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('language');
  const [dailyCooldown, setDailyCooldown] = useState<number>(-1);
  const [claimingDaily, setClaimingDaily] = useState(false);
  const router = useRouter();

  // Fetch packs catalog
  useEffect(() => {
    fetch('/api/store/packs')
      .then(res => res.json())
      .then(data => {
        setPacks(data.packs || []);
        setCategories(data.categories || []);
      })
      .catch(console.error);
  }, []);

  // Check initial daily cooldown state
  useEffect(() => {
    fetch('/api/store/daily')
      .then(res => res.json())
      .then(data => {
        if (!data.canClaim && data.remainingMs) {
          setDailyCooldown(data.remainingMs);
        } else {
          setDailyCooldown(0);
        }
      })
      .catch((e) => {
        console.error(e);
        setDailyCooldown(0); // fallback
      });
  }, []);

  // Daily cooldown countdown
  useEffect(() => {
    if (dailyCooldown <= 0) return;
    const interval = setInterval(() => {
      setDailyCooldown(prev => {
        if (prev <= 1000) return 0;
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [dailyCooldown]);

  const handleClaimDaily = async () => {
    setClaimingDaily(true);
    try {
      const res = await fetch('/api/store/daily', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setCurrency(data.newCurrency);
        setDailyCooldown(24 * 60 * 60 * 1000);
        router.refresh();
      } else if (data.remainingMs) {
        setDailyCooldown(data.remainingMs);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setClaimingDaily(false);
    }
  };

  const handleOpenBooster = async (pack: PackInfo) => {
    if (currency < pack.cost) {
      alert("Not enough Bits!");
      return;
    }
    
    setSelectedPack(pack);
    setLoading(true);
    setCards([]);
    
    const apiCall = fetch('/api/store/booster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packId: pack.id }),
    }).then(res => res.json());
    
    setPackState('SHAKING');
    
    try {
      await new Promise(r => setTimeout(r, 2000));
      
      const data = await apiCall;
      
      if (data.success) {
        setPackState('EXPLODED');
        await new Promise(r => setTimeout(r, 400));
        
        setCurrency(data.newCurrency);
        setCards(data.cards);
        router.refresh();
      } else {
        alert(data.error || 'Failed to open');
        setPackState('IDLE');
        setSelectedPack(null);
      }
    } catch(e) {
      console.error(e);
      alert('Network error');
      setPackState('IDLE');
      setSelectedPack(null);
    } finally {
      setLoading(false);
    }
  };

  const resetStore = () => {
    setCards([]);
    setPackState('IDLE');
    setSelectedPack(null);
  };

  const handleDragEnd = useCallback((event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (packState !== 'IDLE' || !selectedPack) return;
    if (info.offset.x > 140) {
      handleOpenBooster(selectedPack);
    }
  }, [packState, selectedPack, currency]);

  const filteredPacks = packs.filter(p => p.category === activeCategory);

  // ── PACK OPENING VIEW ──
  if (selectedPack && (packState !== 'IDLE' || cards.length > 0)) {
    return (
      <div className="flex flex-col items-center min-h-[70vh] gap-12 pt-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            {selectedPack.name}
          </h1>
          <p className="text-lg text-slate-400">{selectedPack.description}</p>
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-full text-yellow-400 font-bold">
            Your Balance: {currency} Bits
          </div>
        </div>

        <AnimatePresence mode="wait">
          {packState !== 'EXPLODED' && (
            <motion.div 
              key="pack"
              initial={{ scale: 0.8, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 1.5, opacity: 0, filter: 'blur(20px)' }}
              transition={{ duration: 0.4 }}
              className="relative mt-12"
            >
              <motion.div
                animate={packState === 'SHAKING' ? { 
                  x: [-5, 5, -5, 5, 0],
                  rotate: [-2, 2, -2, 2, 0] 
                } : {}}
                transition={packState === 'SHAKING' ? { 
                  repeat: Infinity, 
                  repeatType: 'mirror', 
                  duration: 0.3 
                } : {}}
                className="relative w-64 h-96 rounded-2xl border-4 shadow-[0_0_50px_rgba(99,102,241,0.5)] flex flex-col items-center justify-center overflow-hidden"
                style={{
                  background: selectedPack.visualTheme.gradient,
                  borderColor: selectedPack.visualTheme.border + '80',
                }}
              >
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-30 mix-blend-overlay pointer-events-none" />
                <div className="absolute top-0 w-full h-8 border-b-2 pointer-events-none" style={{ backgroundColor: selectedPack.visualTheme.border + '33', borderColor: selectedPack.visualTheme.border + '4D' }} />
                <div className="absolute bottom-0 w-full h-8 border-t-2 pointer-events-none" style={{ backgroundColor: selectedPack.visualTheme.border + '33', borderColor: selectedPack.visualTheme.border + '4D' }} />
                
                {/* Tear Strip */}
                <div className="absolute top-10 left-0 w-full px-2 z-20">
                  <div className="absolute top-1/2 left-4 right-4 border-t-[3px] border-dashed border-white/50 -translate-y-1/2 pointer-events-none" />
                  
                  {packState === 'IDLE' && (
                    <motion.div
                      drag="x"
                      dragConstraints={{ left: 0, right: 200 }}
                      dragElastic={0.1}
                      onDragEnd={handleDragEnd}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      className="relative w-12 h-12 rounded-full shadow-lg border-2 border-white/50 flex items-center justify-center cursor-grab active:cursor-grabbing"
                      style={{ background: selectedPack.visualTheme.gradient }}
                    >
                      <div className="flex -space-x-2">
                         <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                         </svg>
                         <svg className="w-5 h-5 text-white opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                         </svg>
                      </div>
                    </motion.div>
                  )}
                </div>
                
                {packState === 'SHAKING' && (
                  <div className="absolute inset-0 bg-white/10 animate-pulse mix-blend-overlay" />
                )}

                <div className="relative z-10 text-center pointer-events-none mt-12 px-4">
                  <div className="text-3xl font-black tracking-tighter drop-shadow-lg mb-2" style={{ color: selectedPack.visualTheme.textColor }}>
                    {selectedPack.name}
                  </div>
                  <div className="text-sm font-bold uppercase tracking-[0.3em] opacity-70" style={{ color: selectedPack.visualTheme.textColor }}>
                    {selectedPack.cardCount} Cards
                  </div>
                </div>

                {packState === 'IDLE' && (
                  <div className="absolute bottom-12 px-6 py-2 rounded-full bg-black/50 border text-white font-bold text-sm shadow-xl pointer-events-none flex flex-col items-center"
                    style={{ borderColor: selectedPack.visualTheme.border + '80' }}
                  >
                    <span>{selectedPack.cost} Bits</span>
                    <span className="text-white/60 text-xs mt-0.5">Tear to Open</span>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}

          {packState === 'EXPLODED' && cards.length > 0 && (
            <motion.div 
              key="cards"
              className="w-full max-w-7xl mx-auto space-y-12 z-10"
            >
              <div className="flex flex-wrap justify-center gap-6 perspective-1000 mt-8">
                <AnimatePresence>
                  {cards.map((c, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.2, y: 100, rotateY: 180 }}
                      animate={{ opacity: 1, scale: 1, y: 0, rotateY: 0 }}
                      transition={{ 
                        duration: 0.8, 
                        delay: i * 0.3,
                        type: "spring",
                        bounce: 0.4
                      }}
                    >
                      <Card {...c} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                transition={{ delay: 2.5 }}
                className="text-center pt-12"
              >
                <button
                  onClick={resetStore}
                  className="px-8 py-4 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 font-bold tracking-wider text-slate-300 transition-colors"
                >
                  Done
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── STORE CATALOG VIEW ──
  return (
    <div className="flex flex-col min-h-screen gap-8 pt-8 px-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-5xl md:text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-500">
          The Repository
        </h1>
        <p className="text-xl text-slate-400">Summon new developers to your team.</p>
        
        <div className="flex items-center justify-center gap-4 flex-wrap mt-6">
          {/* Balance */}
          <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-full text-yellow-400 font-bold text-lg">
            <Coin size={24} weight="fill" className="text-yellow-500" />
            {currency} Bits
          </div>

          {/* Daily Claim */}
          <button
            onClick={handleClaimDaily}
            disabled={claimingDaily || dailyCooldown !== 0}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm transition-all ${
              dailyCooldown !== 0
                ? 'bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-green-500 to-emerald-600 border border-green-400/50 text-white hover:shadow-[0_0_20px_rgba(34,197,94,0.4)] hover:scale-105'
            }`}
          >
            <Gift size={20} weight="bold" />
            {dailyCooldown === -1 
              ? 'Checking...' 
              : dailyCooldown > 0 
                ? `Daily: ${formatCountdown(dailyCooldown)}` 
                : claimingDaily 
                  ? 'Claiming...' 
                  : 'Claim 100 Daily Bits'
            }
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 justify-center flex-wrap">
        {categories.map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
              activeCategory === cat.key
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-slate-700/50'
            }`}
          >
            <span className="flex items-center gap-2">
              {CATEGORY_ICONS[cat.key]} 
              {cat.label}
            </span>
          </button>
        ))}
      </div>

      {/* Pack Grid */}
      <motion.div 
        key={activeCategory}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-16"
      >
        {filteredPacks.map(pack => (
          <motion.div
            key={pack.id}
            whileHover={{ scale: 1.05, y: -8 }}
            whileTap={{ scale: 0.98 }}
            className="group cursor-pointer relative mx-auto w-full max-w-[280px]"
            onClick={() => {
              if (loading) return;
              setSelectedPack(pack);
              handleOpenBooster(pack);
            }}
          >
            {/* The Pack Shape */}
            <div 
              className="relative aspect-[2/3] rounded-2xl border-4 shadow-xl flex flex-col items-center overflow-hidden transition-all duration-300"
              style={{
                background: pack.visualTheme.gradient,
                borderColor: pack.visualTheme.border + '80',
                boxShadow: `0 10px 40px ${pack.visualTheme.border}40`,
              }}
            >
              {/* Animated aura if premium currently */}
              {pack.visualTheme.animated && (
                <div className="absolute inset-0 rounded-2xl animate-pulse mix-blend-overlay" 
                  style={{ boxShadow: `inset 0 0 40px ${pack.visualTheme.border}` }} 
                />
              )}

              {/* Textures and Seal borders */}
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 mix-blend-overlay pointer-events-none" />
              <div className="absolute top-0 w-full h-8 border-b-2 pointer-events-none" style={{ backgroundColor: pack.visualTheme.border + '40', borderColor: pack.visualTheme.border + '60' }} />
              <div className="absolute bottom-0 w-full h-8 border-t-2 pointer-events-none" style={{ backgroundColor: pack.visualTheme.border + '40', borderColor: pack.visualTheme.border + '60' }} />
              
              {/* Foil Tear Line Indicator */}
              <div className="absolute top-10 left-0 right-0 border-t-2 border-dashed border-white/30 pointer-events-none" />

              {/* Branding Wrapper */}
              <div className="relative z-10 flex flex-col items-center text-center mt-16 px-4">
                <h3 
                  className="text-3xl font-black tracking-tighter drop-shadow-lg mb-1 leading-none" 
                  style={{ color: pack.visualTheme.textColor }}
                >
                  {pack.name}
                </h3>
                <div 
                  className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-80 mb-6 bg-black/20 px-3 py-1 rounded-full" 
                  style={{ color: pack.visualTheme.textColor }}
                >
                  {pack.cardCount} Cards
                </div>
                
                <p className="text-sm font-medium leading-snug line-clamp-4 mix-blend-luminosity opacity-90" style={{ color: pack.visualTheme.textColor }}>
                  {pack.noPreview ? '??? Unknown Contents' : pack.description}
                </p>
              </div>

              {/* Information Badges Container */}
              <div className="absolute top-14 right-[-2.5rem] rotate-45 z-20 w-32 text-center shadow-lg">
                  {pack.guaranteedMinRarity && (
                    <div 
                      className="text-[10px] font-black uppercase tracking-widest py-1 drop-shadow-md"
                      style={{ backgroundColor: getRarityBadgeColor(pack.guaranteedMinRarity), color: '#000' }}
                    >
                      ≥1 {pack.guaranteedMinRarity}
                    </div>
                  )}
                  {pack.allCommon && (
                    <div className="text-[10px] font-black uppercase tracking-widest py-1 bg-slate-400 text-black drop-shadow-md">
                      Common
                    </div>
                  )}
                  {pack.noPreview && (
                    <div className="text-[10px] font-black uppercase tracking-widest py-1 bg-purple-500 text-white drop-shadow-md animate-pulse">
                      Mystery
                    </div>
                  )}
              </div>

              {/* Cost Button */}
              <div className="absolute bottom-12 w-3/4 py-3 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white font-bold text-lg shadow-2xl flex items-center justify-center gap-2 group-hover:bg-black/70 transition-colors">
                <span className="text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]">{pack.cost}</span>
                <span className="text-xs text-yellow-400/80 uppercase tracking-widest mt-1">Bits</span>
              </div>
            </div>
            
            {/* Hover Glow Behind Pack */}
            <div 
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl -z-10 blur-2xl"
              style={{ background: pack.visualTheme.gradient, transform: 'scale(1.05)' }}
            />
          </motion.div>
        ))}
      </motion.div>

      {/* Daily Missions Section */}
      <section className="mt-12 mb-24 pt-12 border-t border-white/10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold flex items-center gap-3">
            Daily Standup <span className="text-sm font-normal text-slate-400 px-3 py-1 bg-slate-800 rounded-full border border-slate-700">Missions</span>
          </h2>
        </div>
        
        {initialMissions.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/50">
            <p className="text-slate-400">No missions assigned right now. Check back tomorrow!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {initialMissions.map((um) => (
              <div 
                key={um.id} 
                className={`p-6 rounded-2xl border backdrop-blur-sm transition-all ${
                  um.completed 
                    ? 'border-green-500/30 bg-green-500/5' 
                    : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className={`font-bold ${um.completed ? 'text-green-400' : 'text-white'}`}>
                    {um.mission.description}
                  </h3>
                  {um.completed ? (
                    <CheckCircle className="text-green-500" size={24} weight="fill" />
                  ) : (
                    <Circle className="text-slate-600" size={24} weight="regular" />
                  )}
                </div>
                
                <div className="flex justify-between items-end mt-6 pt-4 border-t border-white/5">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Reward</span>
                    <span className="text-yellow-400 font-bold flex items-center gap-1.5">
                      +{um.mission.reward} Bits
                    </span>
                  </div>
                  
                  <div className="text-right">
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wider block mb-1">Progress</span>
                    <span className="font-mono text-sm bg-black/40 px-2 py-1 rounded text-slate-300">
                      {um.progress} / {um.mission.targetValue || 1}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
