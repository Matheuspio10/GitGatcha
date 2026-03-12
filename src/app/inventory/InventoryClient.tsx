'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardProps } from '@/components/Card';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { Code, Trophy, Hourglass, Buildings, Globe, Sparkle } from '@phosphor-icons/react';

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

export default function InventoryClient({ userId }: { userId: string }) {
  const [packs, setPacks] = useState<InventoryPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [packState, setPackState] = useState<'IDLE' | 'SHAKING' | 'EXPLODED'>('IDLE');
  const [selectedPack, setSelectedPack] = useState<InventoryPack | null>(null);
  const [cards, setCards] = useState<CardProps[]>([]);
  
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

  const handleDragEnd = useCallback((event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (packState !== 'IDLE' || !selectedPack) return;
    if (info.offset.x > 140) {
      confirmOpenPack(selectedPack);
    }
  }, [packState, selectedPack]);

  const confirmOpenPack = async (pack: InventoryPack) => {
    setSelectedPack(pack);
    setOpening(true);
    setCards([]);
    
    setPackState('SHAKING');
    
    const apiCall = fetch('/api/inventory/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packId: pack.packId }),
    }).then(res => res.json());

    try {
      await new Promise(r => setTimeout(r, 2000));
      const data = await apiCall;
      
      if (data.success) {
        setPackState('EXPLODED');
        await new Promise(r => setTimeout(r, 400));
        setCards(data.cards);

        // Update local inventory count
        setPacks(prev => {
          const updated = prev.map(p => {
            if (p.packId === pack.packId) return { ...p, count: p.count - 1 };
            return p;
          }).filter(p => p.count > 0);
          return updated;
        });
        
        router.refresh(); // refresh navbar stats implicitly
      } else {
        alert(data.error || 'Failed to open pack');
        setPackState('IDLE');
        setSelectedPack(null);
      }
    } catch(e) {
      console.error(e);
      alert('Network error');
      setPackState('IDLE');
      setSelectedPack(null);
    } finally {
      setOpening(false);
    }
  };

  const resetView = () => {
    setPackState('IDLE');
    setSelectedPack(null);
    setCards([]);
  };

  // ── PACK OPENING VIEW ── (Reused from store but without cost)
  if (selectedPack && (packState !== 'IDLE' || cards.length > 0)) {
    return (
      <div className="flex flex-col items-center min-h-[70vh] gap-12 pt-8">

        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            {selectedPack.packName}
          </h1>
          <p className="text-lg text-slate-400">Opening booster pack...</p>
        </div>

        <AnimatePresence mode="wait">
          {packState !== 'EXPLODED' && selectedPack.visualTheme && (
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
                         <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                      </div>
                    </motion.div>
                  )}
                </div>
                
                {packState === 'SHAKING' && (
                  <div className="absolute inset-0 bg-white/10 animate-pulse mix-blend-overlay" />
                )}

                <div className="relative z-10 text-center pointer-events-none mt-12 px-4">
                  <div className="text-3xl font-black tracking-tighter drop-shadow-lg mb-2" style={{ color: selectedPack.visualTheme.textColor }}>
                    {selectedPack.packName}
                  </div>
                </div>
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
                <div className="mb-6 font-bold text-yellow-500">
                  +50 XP
                </div>
                <button
                  onClick={resetView}
                  className="px-8 py-4 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 font-bold tracking-wider text-slate-300 transition-colors"
                >
                  Return to Inventory
                </button>
              </motion.div>
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
              <p className="text-slate-400 mb-8">
                This will consume one pack from your inventory and reveal {selectedPack.cardCount} cards.
              </p>
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
