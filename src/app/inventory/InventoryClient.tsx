'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CardProps } from '@/components/Card';
import { BoosterReveal } from '@/components/BoosterReveal';
import { motion, AnimatePresence } from 'framer-motion';

interface PackVisualTheme {
  gradient: string;
  border: string;
  textColor: string;
  accentColor: string;
  animated?: boolean;
}

interface InventoryPack {
  packId: string;
  packName: string;
  count: number;
  visualTheme: PackVisualTheme | null;
  cardCount: number;
  guaranteedMinRarity: string | null;
  category: string;
  description: string;
  activeFilters?: string;
  allCommon?: boolean;
  noPreview?: boolean;
}



function getRarityBadgeColor(rarity: string | null): string {
  switch (rarity) {
    case 'Legendary': return '#ffd700';
    case 'Epic': return '#a855f7';
    case 'Rare': return '#3b82f6';
    default: return '';
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function InventoryClient({ userId }: { userId: string }) {
  const [packs, setPacks] = useState<InventoryPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [packState, setPackState] = useState<'IDLE' | 'CHARGING' | 'OVERCHARGED' | 'EXPLODED' | 'CARDS_REVEALED'>('IDLE');
  const [apiState, setApiState] = useState<'IDLE' | 'PENDING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [energy, setEnergy] = useState(0);
  const [requiredClicks, setRequiredClicks] = useState(15);
  const [clickParticles, setClickParticles] = useState<{id: number, x: number, y: number}[]>([]);
  const [particleCoordsId, setParticleCoordsId] = useState(0);

  const [selectedPack, setSelectedPack] = useState<InventoryPack | null>(null);
  const [cards, setCards] = useState<CardProps[]>([]);
  const [packDropFragments, setPackDropFragments] = useState<{language: string, amount: number} | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const router = useRouter();

  const fetchInventory = async () => {
    try {
      const res = await fetch('/api/inventory');
      const data = await res.json();
      if (data.inventory) {
        setPacks(data.inventory);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const checkWishlistProgress = (data: { packDropFragments?: { language: string, amount: number }, cards: { isDuplicate?: boolean, language?: string }[] }) => {
    fetch('/api/forge/wallet').then(res => res.json()).then(wallet => {
      const fragments = wallet.fragments || {};
      const wishlist = wallet.wishlist || [];
      const earnedLangs = new Set<string>();
      if (data.packDropFragments) earnedLangs.add(data.packDropFragments.language);
      data.cards.forEach((c: { isDuplicate?: boolean, language?: string }) => {
        if (c.isDuplicate && c.language && c.language !== 'Unknown') earnedLangs.add(c.language);
      });
      earnedLangs.forEach(lang => {
        const wItem = wishlist.find((w: { primaryLanguage: string, fragmentsRequired: number, name: string }) => w.primaryLanguage === lang);
        if (wItem) {
          const current = fragments[lang] || 0;
          import('react-hot-toast').then(mod => {
            mod.toast(`🌟 ${lang} fragment earned — ${Math.min(current, wItem.fragmentsRequired)} of ${wItem.fragmentsRequired} toward ${wItem.name}!`, { 
              duration: 6000,
              style: { background: '#1e1b4b', color: '#fff', border: '1px solid #4f46e5' }
            });
          });
        }
      });
    }).catch(console.error);
  };

  const confirmOpenPack = (pack: InventoryPack) => {
    setSelectedPack(pack);
    setOpening(true);
    setCards([]);
    setPackDropFragments(null);
    setErrorMessage(null);
    setEnergy(0);
    setRequiredClicks(Math.floor(Math.random() * (5 - 3 + 1)) + 3); // 3 to 5
    
    setPackState('CHARGING');
    setApiState('PENDING');

    fetch('/api/inventory/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packId: pack.packId }),
    })
    .then(async res => {
      const data = await res.json();
      if (data.success) {
        setCards(data.cards);
        if (data.packDropFragments) {
          setPackDropFragments(data.packDropFragments);
        }
        checkWishlistProgress(data);

        // Update local inventory count
        setPacks(prev => prev.map(p => p.packId === pack.packId ? { ...p, count: p.count - 1 } : p).filter(p => p.count > 0));
        router.refresh();
        setApiState('SUCCESS');
      } else {
        setErrorMessage(data.error || 'Failed to open pack');
        setApiState('ERROR');
      }
    })
    .catch(e => {
      console.error(e);
      setErrorMessage('Network error');
      setApiState('ERROR');
    });
  };

  const playClickSound = (progress: number) => {
    try {
      const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      const pitch = 150 + (250 * progress);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(pitch, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.1);
      
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {
      // Ignore
    }
  };

  const handlePackClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (packState !== 'CHARGING' && packState !== 'OVERCHARGED') return;

    // Mobile haptics
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }
    
    // Coordinates for particles
    let clientX = 0, clientY = 0;
    if ('touches' in e && (e as React.TouchEvent).touches.length > 0) {
      clientX = (e as React.TouchEvent).touches[0].clientX;
      clientY = (e as React.TouchEvent).touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const newId = particleCoordsId + 1;
    setParticleCoordsId(newId);
    setClickParticles(prev => [...prev, { id: newId, x: clientX, y: clientY }]);
    setTimeout(() => {
      setClickParticles(prev => prev.filter(p => p.id !== newId));
    }, 400);

    const newEnergy = Math.min(energy + 1, requiredClicks);
    setEnergy(newEnergy);
    playClickSound(Math.min(newEnergy / requiredClicks, 1));
  };

  useEffect(() => {
    if ((packState === 'CHARGING' || packState === 'OVERCHARGED') && apiState === 'SUCCESS' && energy >= requiredClicks) {
      setPackState('EXPLODED');
      setTimeout(() => {
        setPackState('CARDS_REVEALED');
        setOpening(false);
      }, 800);
    } else if (packState === 'CHARGING' && apiState === 'PENDING' && energy >= requiredClicks) {
      setPackState('OVERCHARGED');
    } else if ((packState === 'CHARGING' || packState === 'OVERCHARGED') && apiState === 'ERROR') {
      setTimeout(() => {
        setPackState('IDLE');
        setOpening(false);
      }, 1000); // 1s gentle defuse
    }
  }, [energy, requiredClicks, apiState, packState]);

  const resetView = () => {
    setPackState('IDLE');
    setApiState('IDLE');
    setSelectedPack(null);
    setCards([]);
    setErrorMessage(null);
  };

  const energyProgress = Math.min((energy / requiredClicks) * 100, 100);
  
  let chargingText = "Charging…";
  if (apiState === 'ERROR') chargingText = "Defusing...";
  else if (packState === 'OVERCHARGED') chargingText = "OVERCHARGED — HOLD ON!";
  else if (energyProgress >= 90) chargingText = "READY TO EXPLODE!";
  else if (energyProgress >= 70) chargingText = "Keep going!";
  else if (energyProgress >= 40) chargingText = "Almost there…";

  let glowColor = "rgba(59, 130, 246, 0.5)"; // Blue
  if (apiState === 'ERROR') glowColor = "rgba(239, 68, 68, 0.2)"; // Reddish fade
  else if (energyProgress >= 80) glowColor = "rgba(255, 255, 255, 0.8)"; // White
  else if (energyProgress >= 40) glowColor = "rgba(249, 115, 22, 0.6)"; // Orange

  // ── PACK OPENING VIEW ──
  if (selectedPack && (packState !== 'IDLE' || cards.length > 0 || errorMessage)) {
    return (
      <div className="flex flex-col items-center min-h-[70vh] gap-12 pt-8 pb-40 relative w-full overflow-hidden">
        {clickParticles.map(p => (
          <motion.div
            key={p.id}
            initial={{ scale: 0.5, opacity: 1, x: '-50%', y: '-50%' }}
            animate={{ scale: 2.5, opacity: 0, x: '-50%', y: '-50%' }}
            transition={{ duration: 0.4 }}
            className="fixed pointer-events-none rounded-full bg-white z-50 w-4 h-4 shadow-[0_0_15px_white]"
            style={{ left: p.x, top: p.y }}
          />
        ))}

        {packState === 'EXPLODED' && (
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white pointer-events-none"
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        )}

        {/* Dynamic Vignette Background */}
        {(packState === 'CHARGING' || packState === 'OVERCHARGED') && (
          <div 
            className="fixed inset-0 pointer-events-none transition-opacity duration-300 z-0"
            style={{ 
              background: 'radial-gradient(circle, transparent 30%, rgba(0,0,0,0.85) 100%)',
              opacity: energyProgress >= 60 ? (energyProgress / 100) : 0 
            }} 
          />
        )}

        <div className="text-center space-y-4 z-20">
          <h1 className="text-4xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            {selectedPack.packName}
          </h1>
          <p className="text-lg text-slate-400">
            {errorMessage ? "Opening failed" : "Repeatedly tap or click to open!"}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {packState !== 'EXPLODED' && packState !== 'CARDS_REVEALED' && selectedPack.visualTheme && (
            <motion.div 
              key="pack"
              initial={{ scale: 0.8, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 1.5, opacity: 0, filter: 'blur(20px)' }}
              transition={{ duration: 0.4 }}
              className="relative mt-12 z-20"
            >
              {/* Energy Ring */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-10">
                <svg className="w-[450px] h-[450px] -rotate-90 origin-center" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
                  <circle 
                    cx="50" cy="50" r="45" fill="none" 
                    stroke={glowColor} strokeWidth="4" 
                    strokeDasharray="283" 
                    strokeDashoffset={283 - (283 * energyProgress / 100)} 
                    className="transition-all duration-300 drop-shadow-lg"
                    style={{ filter: energyProgress > 50 ? `drop-shadow(0 0 10px ${glowColor})` : 'none' }}
                  />
                </svg>
              </div>

              {/* Booster Container wrapper for click pulse */}
              <motion.div
                key={energy} // Resets control so scale pulse triggers on each energy change
                initial={{ scale: 1 }}
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 0.08 }}
                onClick={handlePackClick}
                onTouchStart={handlePackClick}
                className="cursor-pointer select-none"
                style={{ touchAction: 'none', WebkitUserSelect: 'none' }}
              >
                {/* Shake layer */}
                <motion.div
                  animate={
                    apiState === 'ERROR' ? { opacity: 0.5, scale: 0.95 } :
                    packState === 'OVERCHARGED' || energyProgress >= 85 ? { x: [-8, 8, -8, 8, 0], y: [-4, 4, -4, 4, 0] } :
                    energyProgress >= 60 ? { x: [-4, 4, -4, 4, 0] } :
                    energyProgress >= 30 ? { x: [-2, 2, -2, 2, 0] } :
                    { y: [-5, 5, -5] } 
                  }
                  transition={
                    apiState === 'ERROR' ? { duration: 1 } :
                    packState === 'OVERCHARGED' || energyProgress >= 85 ? { repeat: Infinity, duration: 0.1 } :
                    energyProgress >= 60 ? { repeat: Infinity, duration: 0.15 } :
                    energyProgress >= 30 ? { repeat: Infinity, duration: 0.2 } :
                    { repeat: Infinity, duration: 3, ease: 'easeInOut' }
                  }
                  className="relative w-64 h-96 rounded-2xl border-4 text-center flex flex-col items-center justify-center overflow-hidden min-w-[200px] min-h-[280px]"
                  style={{
                    background: selectedPack.visualTheme.gradient,
                    borderColor: selectedPack.visualTheme.border + '80',
                    boxShadow: energyProgress > 0 && apiState !== 'ERROR' ? `0 0 ${energyProgress}px ${glowColor}` : 'none',
                  }}
                >
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-30 mix-blend-overlay pointer-events-none" />
                  
                  {/* Cracks effect layered on top */}
                  {energyProgress >= 85 && (
                    <motion.div 
                      className="absolute inset-0 bg-white/20 z-10 mix-blend-overlay pointer-events-none"
                      animate={{ opacity: [0, 0.4, 0] }}
                      transition={{ duration: 0.1, repeat: Infinity }}
                    />
                  )}

                  <div className="relative z-10 pointer-events-none mt-12 px-4">
                    <div className="text-3xl font-black tracking-tighter drop-shadow-lg mb-2" style={{ color: selectedPack.visualTheme.textColor }}>
                      {selectedPack.packName}
                    </div>
                  </div>
                </motion.div>
              </motion.div>

              <div className="absolute -bottom-20 left-0 right-0 text-center pointer-events-none font-bold text-xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] pb-8" style={{ color: apiState === 'ERROR' ? '#ef4444' : glowColor }}>
                {chargingText}
              </div>

              {errorMessage && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute -bottom-32 left-0 right-0 text-center w-full"
                >
                  <div className="bg-slate-900 border border-red-500/50 p-4 rounded-xl shadow-xl flex flex-col gap-3">
                    <div className="text-slate-200">Something went wrong — your pack is safe, try again!</div>
                    <button onClick={resetView} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors z-30">
                      Retry
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {packState === 'CARDS_REVEALED' && cards.length > 0 && (
            <motion.div key="cards" className="w-full z-20 relative">
              <BoosterReveal 
                cards={cards as (CardProps & { isDuplicate?: boolean; fragmentsEarned?: number })[]} 
                packDropFragments={packDropFragments} 
                onComplete={resetView} 
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── INVENTORY VIEW ──
  return (
    <div className="flex flex-col min-h-screen gap-8 pt-8 px-4 max-w-7xl mx-auto">
      <div className="text-center space-y-4">
        <h1 className="text-5xl md:text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-500">
          Your Inventory
        </h1>
        <p className="text-xl text-slate-400">Unopened booster packs await.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
        </div>
      ) : packs.length === 0 ? (
        <div className="text-center py-20 bg-slate-800/20 rounded-[2rem] border-2 border-dashed border-slate-700/50">
          <div className="text-5xl mb-4 text-slate-600">🎒</div>
          <h3 className="text-2xl font-bold mb-2">Vault is empty</h3>
          <p className="text-slate-400">Visit the Store or level up to get more booster packs.</p>
          <button 
            onClick={() => router.push('/store')}
            className="mt-6 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors"
          >
            Go to Store
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 pb-16 mt-8">
          {packs.map(pack => (
            <motion.div
              key={pack.packId}
              whileHover={{ scale: 1.05, y: -8 }}
              whileTap={{ scale: 0.98 }}
              className="group cursor-pointer relative mx-auto w-full max-w-[280px]"
              onClick={() => {
                if (opening) return;
                // If it's a click without dragging, we'll just open the modal or start the flow
                setSelectedPack(pack);
              }}
            >
              <div 
                className="relative aspect-[2/3] rounded-2xl border-4 shadow-xl flex flex-col items-center overflow-hidden transition-all duration-300"
                style={{
                  background: pack.visualTheme?.gradient || 'linear-gradient(to bottom, #333, #111)',
                  borderColor: (pack.visualTheme?.border || '#555') + '80',
                }}
              >
                {/* Count Badge */}
                <div className="absolute top-4 right-4 z-30 bg-red-600 text-white w-10 h-10 rounded-full flex justify-center items-center font-black text-xl shadow-lg border-2 border-white/20">
                  {pack.count}
                </div>

                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 mix-blend-overlay pointer-events-none" />
                
                {/* Branding */}
                <div className="relative z-10 flex flex-col items-center text-center mt-20 px-4">
                  <h3 
                    className="text-3xl font-black tracking-tighter drop-shadow-lg mb-1 leading-none" 
                    style={{ color: pack.visualTheme?.textColor || '#fff' }}
                  >
                    {pack.packName}
                  </h3>
                  <div 
                    className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-80 mb-6 bg-black/20 px-3 py-1 rounded-full" 
                    style={{ color: pack.visualTheme?.textColor || '#fff' }}
                  >
                    {pack.cardCount} Cards
                  </div>
                </div>

                {pack.guaranteedMinRarity && (
                  <div className="absolute bottom-16 w-full text-center z-20">
                    <div 
                      className="inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded shadow-md"
                      style={{ backgroundColor: getRarityBadgeColor(pack.guaranteedMinRarity), color: '#000' }}
                    >
                      ≥1 {pack.guaranteedMinRarity}
                    </div>
                  </div>
                )}

                <div className="absolute bottom-0 w-full bg-black/60 backdrop-blur-sm py-4 text-center font-bold text-white border-t border-white/10 group-hover:bg-indigo-600/80 transition-colors">
                  Tap to Open
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Confirmation Modal if tapped instead of dragged */}
      <AnimatePresence>
        {selectedPack && packState === 'IDLE' && !opening && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <h3 className="text-2xl font-black mb-2 flex items-center gap-2">
                Open <span style={{ color: selectedPack.visualTheme?.textColor || '#fff' }}>{selectedPack.packName}</span>?
              </h3>
              <p className="text-slate-400 mb-6">
                This will consume one pack from your inventory and reveal {selectedPack.cardCount} cards.
              </p>

              {/* Transparency UI Info */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-8">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Pack Details</div>
                {selectedPack.activeFilters && (
                  <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-700">
                    <span className="text-slate-300 font-medium text-sm">Active Filter:</span>
                    <span className="text-indigo-400 font-bold text-sm text-right max-w-[60%]">{selectedPack.activeFilters}</span>
                  </div>
                )}
                
                <div className="flex flex-col gap-1 mt-3">
                  <span className="text-slate-300 font-medium text-sm mb-1">Rarity Distribution:</span>
                  {selectedPack.noPreview ? (
                    <div className="text-sm font-black text-purple-400 animate-pulse">??? Unknown Odds</div>
                  ) : selectedPack.allCommon ? (
                    <div className="text-sm text-slate-400">100% Common Junk</div>
                  ) : selectedPack.cardCount === 5 ? (
                    <ul className="text-xs text-slate-400 space-y-1 ml-1">
                      <li><span className="text-slate-200">Slot 1 & 2:</span> 100% Common</li>
                      <li><span className="text-slate-200">Slot 3:</span> 70% Common, 30% Uncommon</li>
                      <li><span className="text-slate-200">Slot 4:</span> 60% Uncommon, 40% Rare</li>
                      <li><span className="text-slate-200">Slot 5:</span> <span className="text-blue-400">55% Rare</span>, <span className="text-purple-400">30% Epic</span>, <span className="text-yellow-400">15% Legendary</span></li>
                    </ul>
                  ) : (
                    <div className="text-sm text-yellow-400 font-bold">Guaranteed ±{selectedPack.guaranteedMinRarity} pulls</div>
                  )}
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setSelectedPack(null)}
                  className="flex-1 py-3 px-4 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-white transition-colors border border-slate-700 hover:border-slate-600"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => confirmOpenPack(selectedPack)}
                  className="flex-1 py-3 px-4 rounded-xl font-black bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_30px_rgba(79,70,229,0.5)] border border-indigo-400/50 hover:-translate-y-0.5"
                >
                  Tear Open!
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
