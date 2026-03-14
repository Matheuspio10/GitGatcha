'use client';

import { useState, useMemo } from 'react';
import { CardProps, Card } from '@/components/Card';
import { CaretLeft, CaretRight, Star, ListDashes, SquaresFour, GithubLogo, X, Lightning, Trophy, Sword, Shield, Heart, Fire, Crown } from '@phosphor-icons/react';
import { calculateCurrentStamina } from '@/lib/staminaUtils';
import clsx from 'clsx';

type ExtendedCard = CardProps & {
  shards?: number;
  userCardId?: string;
  isShiny?: boolean;
  loyaltyCount?: number;
  loyaltyTier?: string;
  loyaltyMilestones?: any[];
  lifetimeStats?: any;
  showcaseOrder?: number | null;
};

type SortOption = 'RARITY' | 'NAME' | 'HP' | 'ATK' | 'DEF' | 'COUNT' | 'LOYALTY';

const RARITY_ORDER: Record<string, number> = {
  'Legendary': 5,
  'Epic': 4,
  'Rare': 3,
  'Uncommon': 2,
  'Common': 1
};

const RARITY_COLORS: Record<string, string> = {
  'Legendary': '#ffd700',
  'Epic': '#a855f7',
  'Rare': '#3b82f6',
  'Uncommon': '#22c55e',
  'Common': '#94a3b8'
};

const RARITY_ABBR: Record<string, string> = {
  'Legendary': 'L',
  'Epic': 'E',
  'Rare': 'R',
  'Uncommon': 'U',
  'Common': 'C'
};

// ─── Loyalty Constants ─────────────────────────────────────────────────────────

const LOYALTY_TIERS: Record<string, { title: string; color: string; icon: string; atkDefBonus: number; hpBonus: number; threshold: number }> = {
  none: { title: '', color: '#475569', icon: '', atkDefBonus: 0, hpBonus: 0, threshold: 0 },
  veteran: { title: 'Veteran', color: '#a78bfa', icon: '⭐', atkDefBonus: 3, hpBonus: 0, threshold: 10 },
  trusted: { title: 'Trusted', color: '#fbbf24', icon: '🛡️', atkDefBonus: 7, hpBonus: 0, threshold: 25 },
  reliable: { title: 'Reliable', color: '#f97316', icon: '🔥', atkDefBonus: 12, hpBonus: 0, threshold: 50 },
  legendary_bond: { title: 'Legendary Bond', color: '#ec4899', icon: '💎', atkDefBonus: 18, hpBonus: 5, threshold: 100 },
  eternal: { title: 'Eternal', color: '#06b6d4', icon: '♾️', atkDefBonus: 25, hpBonus: 10, threshold: 200 },
};

const MILESTONE_ORDER = ['veteran', 'trusted', 'reliable', 'legendary_bond', 'eternal'];

function getNextMilestone(count: number): { tier: string; threshold: number } | null {
  for (const tier of MILESTONE_ORDER) {
    if (count < LOYALTY_TIERS[tier].threshold) {
      return { tier, threshold: LOYALTY_TIERS[tier].threshold };
    }
  }
  return null;
}

function LoyaltyBadge({ tier, size = 'sm' }: { tier: string; size?: 'sm' | 'md' | 'lg' }) {
  const info = LOYALTY_TIERS[tier];
  if (!info || tier === 'none') return null;

  const sizeClasses = {
    sm: 'text-[9px] px-1.5 py-0.5 gap-0.5',
    md: 'text-[10px] px-2 py-1 gap-1',
    lg: 'text-xs px-2.5 py-1 gap-1.5',
  };

  return (
    <span
      className={clsx('inline-flex items-center font-bold rounded-full border whitespace-nowrap', sizeClasses[size])}
      style={{ color: info.color, borderColor: `${info.color}40`, backgroundColor: `${info.color}15` }}
    >
      <span>{info.icon}</span>
      <span>{info.title}</span>
    </span>
  );
}

function LoyaltyProgressBar({ count, tier }: { count: number; tier: string }) {
  const next = getNextMilestone(count);

  if (!next) {
    // Eternal tier - max reached
    const info = LOYALTY_TIERS.eternal;
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold" style={{ color: info.color }}>♾️ ETERNAL</span>
        <span className="text-[9px] text-slate-500 font-mono">{count} battles</span>
      </div>
    );
  }

  const prevThreshold = MILESTONE_ORDER.indexOf(next.tier) > 0
    ? LOYALTY_TIERS[MILESTONE_ORDER[MILESTONE_ORDER.indexOf(next.tier) - 1]].threshold
    : 0;
  const progress = ((count - prevThreshold) / (next.threshold - prevThreshold)) * 100;
  const nextInfo = LOYALTY_TIERS[next.tier];

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Loyalty</span>
        <span className="text-[9px] font-mono text-slate-400">
          {count} / {next.threshold} <span className="text-slate-600">→</span>{' '}
          <span style={{ color: nextInfo.color }}>{nextInfo.title}</span>
        </span>
      </div>
      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden shadow-inner">
        <div
          className="h-full transition-all duration-700 rounded-full"
          style={{
            width: `${Math.max(2, Math.min(100, progress))}%`,
            backgroundColor: nextInfo.color,
            boxShadow: `0 0 8px ${nextInfo.color}80`,
          }}
        />
      </div>
    </div>
  );
}

export default function CollectionClient({ initialCards }: { initialCards: ExtendedCard[] }) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('RARITY');
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'LIST' | 'GRID'>('LIST');
  const [selectedCard, setSelectedCard] = useState<ExtendedCard | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [localCards, setLocalCards] = useState<ExtendedCard[]>(initialCards);
  const itemsPerPage = 20;

  // Global Collection Stats calculations
  const totalUnique = localCards.length;
  const totalPulls = localCards.reduce((acc, card) => acc + (1 + (card.shards || 0)), 0);

  const rarityCounts = useMemo(() => {
    const counts = { Legendary: 0, Epic: 0, Rare: 0, Uncommon: 0, Common: 0 };
    localCards.forEach(c => {
      const r = c.rarity as keyof typeof counts;
      if (counts[r] !== undefined) {
        counts[r] += 1;
      }
    });
    return counts;
  }, [localCards]);

  const sortedAndFiltered = useMemo(() => {
    let result = [...localCards];

    // Filter
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(c => 
        c.name.toLowerCase().includes(s) || 
        c.githubUsername.toLowerCase().includes(s)
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'RARITY':
          comparison = (RARITY_ORDER[a.rarity] || 0) - (RARITY_ORDER[b.rarity] || 0);
          break;
        case 'NAME':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'ATK':
          comparison = a.atk - b.atk;
          break;
        case 'DEF':
          comparison = a.def - b.def;
          break;
        case 'HP':
          comparison = a.hp - b.hp;
          break;
        case 'COUNT':
          comparison = (a.shards || 0) - (b.shards || 0);
          break;
        case 'LOYALTY':
          comparison = (a.loyaltyCount || 0) - (b.loyaltyCount || 0);
          break;
      }
      // if same on primary sort, fallback to ID/name
      if (comparison === 0) {
        comparison = a.githubUsername.localeCompare(b.githubUsername);
        return sortDesc ? -comparison : comparison; // Always consistent fallback
      }
      
      return sortDesc ? -comparison : comparison;
    });

    return result;
  }, [localCards, search, sortBy, sortDesc]);

  const totalPages = Math.ceil(sortedAndFiltered.length / itemsPerPage) || 1;
  const paginatedData = sortedAndFiltered.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const handleSort = (option: SortOption) => {
    if (sortBy === option) {
      setSortDesc(!sortDesc);
    } else {
      setSortBy(option);
      setSortDesc(true);
    }
    setPage(1);
  };

  const handleRecoverStamina = async (card: ExtendedCard) => {
    if (!card.userCardId || recovering) return;
    setRecovering(true);
    try {
      const res = await fetch('/api/collection/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userCardId: card.userCardId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to recover stamina');
      } else {
        // Optimistically update the local state to 100 stamina
        setLocalCards(prev => prev.map(c => 
          c.userCardId === card.userCardId 
            ? { ...c, stamina: 100, lastUsedAt: new Date().toISOString() as any } 
            : c
        ));
        if (selectedCard && selectedCard.userCardId === card.userCardId) {
          setSelectedCard({ ...selectedCard, stamina: 100, lastUsedAt: new Date().toISOString() as any });
        }
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred');
    } finally {
      setRecovering(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* 1. Stats Dashboard Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-800 pb-4">
          <h1 className="text-2xl font-black text-white px-2">Collection Stats</h1>
          <div className="text-sm text-slate-400 font-medium px-2">
            Unique Cards: <span className="text-white font-bold text-base">{totalUnique}</span>{' '}
            <span className="text-slate-600 mx-2">|</span>{' '}
            Total Pulls: <span className="text-white font-bold text-base">{totalPulls}</span>
          </div>
        </div>

        {/* Rarity Breakdown Boxes */}
        <div className="flex flex-wrap gap-3">
          {(Object.entries(raritiesConfig) as [string, { label: string, color: string }][]).map(([key, info]) => {
            const count = rarityCounts[info.label as keyof typeof rarityCounts] || 0;
            const percentage = totalUnique > 0 ? ((count / totalUnique) * 100).toFixed(1) : '0.0';
            
            return (
              <div 
                key={key} 
                className="flex-1 min-w-[120px] bg-slate-950/50 border border-slate-800 rounded-lg p-3 relative overflow-hidden group"
              >
                <div 
                  className="absolute top-0 left-0 w-1 h-full" 
                  style={{ backgroundColor: info.color }} 
                />
                <div className="flex justify-between items-start mb-2 pl-2">
                  <span className="font-bold text-sm tracking-widest" style={{ color: info.color }}>{key}</span>
                  <span className="text-xs font-mono text-slate-400">{count}</span>
                </div>
                <div className="pl-2">
                  <div className="w-full h-1 bg-slate-800 rounded-full mt-2 overflow-hidden">
                     <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${percentage}%`, backgroundColor: info.color }} />
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 text-right">{percentage}%</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Toolbar & Sorting */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-slate-800 rounded-lg p-1 mr-2 md:mr-4">
              <button 
                onClick={() => setViewMode('LIST')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'LIST' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                title="List View"
              >
                <ListDashes size={18} weight="bold" />
              </button>
              <button 
                onClick={() => setViewMode('GRID')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'GRID' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                title="Grid View"
              >
                <SquaresFour size={18} weight="bold" />
              </button>
            </div>
            <span className="text-sm text-slate-400 mr-2">Sort By:</span>
            {(['RARITY', 'NAME', 'HP', 'ATK', 'DEF', 'COUNT', 'LOYALTY'] as SortOption[]).map(opt => (
              <button
                key={opt}
                onClick={() => handleSort(opt)}
                className={`text-xs font-bold px-3 py-1.5 rounded transition-colors ${
                  sortBy === opt 
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {opt} {sortBy === opt ? (sortDesc ? '↓' : '↑') : ''}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-4 w-full md:w-auto">
             <div className="flex items-center gap-2 text-sm text-slate-400">
               <span>Page</span>
               <div className="bg-black/50 border border-slate-700 rounded px-3 py-1 text-white font-mono">
                 {page}
               </div>
               <span>of {totalPages}</span>
               
               <div className="flex gap-1 ml-2">
                 <button 
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white transition-colors"
                 >
                   <CaretLeft weight="bold" />
                 </button>
                 <button 
                  disabled={page === totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white transition-colors"
                 >
                   <CaretRight weight="bold" />
                 </button>
               </div>
             </div>
          </div>
        </div>

        <div className="relative w-full">
           <input 
             type="text" 
             placeholder="Search by title..." 
             value={search}
             onChange={e => { setSearch(e.target.value); setPage(1); }}
             className="w-full bg-black/60 border border-slate-800 rounded-lg px-4 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
           />
        </div>
      </div>

      {/* 3. Table or Grid View */}
      {viewMode === 'LIST' ? (
        <div className="bg-black border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/80 border-b border-slate-800 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-4">Rank</th>
                  <th className="px-6 py-4">Title (Username)</th>
                  <th className="px-6 py-4 text-right">HP</th>
                  <th className="px-6 py-4 text-right">ATK</th>
                  <th className="px-6 py-4 text-right">DEF</th>
                  <th className="px-6 py-4 text-center">STM</th>
                  <th className="px-6 py-4 text-center">Loyalty</th>
                  <th className="px-6 py-4 text-right">CNT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                      No records found in the database.
                    </td>
                  </tr>
                ) : (
                  paginatedData.map(card => {
                    const qty = 1 + (card.shards || 0);
                    const rarityColor = RARITY_COLORS[card.rarity] || '#fff';
                    const abbr = RARITY_ABBR[card.rarity] || 'UNK';
                    const loyaltyCount = card.loyaltyCount || 0;
                    const loyaltyTier = card.loyaltyTier || 'none';
                    
                    return (
                      <tr 
                        key={card.userCardId || `${card.githubUsername}-${Math.random()}`} 
                        onClick={() => setSelectedCard(card)} 
                        className="hover:bg-slate-900/50 transition-colors group cursor-pointer"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span 
                            className="font-black text-sm tracking-widest drop-shadow-md"
                            style={{ color: rarityColor }}
                          >
                            {abbr}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <Star weight="fill" className="opacity-20 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: rarityColor }} size={16} />
                            <span className="font-medium text-slate-200">{card.name}</span>
                            <span className="text-xs text-slate-600 font-mono">@{card.githubUsername}</span>
                            <LoyaltyBadge tier={loyaltyTier} size="sm" />
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-emerald-400/90 text-sm">
                          {card.hp}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-red-400/90 text-sm">
                          {card.atk}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-blue-400/90 text-sm">
                          {card.def}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {(() => {
                            const st = card.stamina !== undefined ? calculateCurrentStamina(card.stamina, card.lastUsedAt ? new Date(card.lastUsedAt) : new Date(), card.inActiveTeam || false) : 100;
                            return (
                              <span className={clsx("text-xs font-mono font-bold px-2 py-1 rounded", st < 40 ? 'text-red-400 bg-red-400/10' : st < 80 ? 'text-yellow-400 bg-yellow-400/10' : 'text-green-400 bg-green-400/10')}>
                                {st}%
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="text-xs font-mono text-slate-400">{loyaltyCount}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="text-xs font-mono text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                            x{qty}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {paginatedData.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-500 bg-black border border-slate-800 rounded-xl">
              No records found in the database.
            </div>
          ) : (
            paginatedData.map(card => (
              <div 
                key={card.userCardId || `${card.githubUsername}-${Math.random()}`} 
                onClick={() => setSelectedCard(card)} 
                className="cursor-pointer flex justify-center w-full"
              >
                 <Card
                   {...card}
                   quantity={1 + (card.shards || 0)}
                   disableLink={true}
                   loyaltyTier={card.loyaltyTier}
                   loyaltyCount={card.loyaltyCount}
                 />
              </div>
            ))
          )}
        </div>
      )}

      {/* 4. Large Card Modal with Loyalty Details */}
      {selectedCard && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto" onClick={() => setSelectedCard(null)}>
          <div className="relative flex flex-col md:flex-row items-center md:items-start justify-center gap-6 w-full max-w-5xl my-auto" onClick={e => e.stopPropagation()}>
             <button 
               onClick={() => setSelectedCard(null)}
               className="absolute -top-2 right-0 md:-right-12 text-slate-400 hover:text-white transition-colors bg-black/50 p-2 rounded-full border border-slate-700 z-10"
             >
               <X size={24} />
             </button>
             
             <div className="flex flex-col items-center gap-4 flex-shrink-0 mt-4 md:mt-0 xl:mr-8 origin-top">
               <div className="pointer-events-none scale-90 sm:scale-100 xl:scale-110 origin-top">
                 <Card
                   {...selectedCard}
                   quantity={1 + (selectedCard.shards || 0)}
                   disableLink={true}
                   loyaltyTier={selectedCard.loyaltyTier}
                   loyaltyCount={selectedCard.loyaltyCount}
                 />
               </div>
               
               {/* Buttons below the card */}
               <div className="flex flex-row gap-3 items-center justify-center w-full mt-2">
                 <a 
                   href={`https://github.com/${selectedCard.githubUsername}`}
                   target="_blank"
                   rel="noopener noreferrer"
                   className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-[0_0_15px_rgba(79,70,229,0.3)] transition-all hover:scale-105 text-sm"
                 >
                   <GithubLogo size={18} weight="fill" />
                   Open Profile
                 </a>

                 {selectedCard.stamina !== undefined && calculateCurrentStamina(selectedCard.stamina, selectedCard.lastUsedAt ? new Date(selectedCard.lastUsedAt) : new Date(), selectedCard.inActiveTeam || false) < 100 && (
                   <button
                     onClick={() => handleRecoverStamina(selectedCard)}
                     disabled={recovering}
                     className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all hover:scale-105 text-sm disabled:opacity-50 disabled:hover:scale-100"
                   >
                     <Lightning size={18} weight="fill" />
                     {recovering ? 'Recovering...' : 'Cure (100)'}
                   </button>
                 )}
               </div>
             </div>

             {/* Loyalty Progress Section */}
             <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4">
               <div className="flex items-center justify-between">
                 <h3 className="text-sm font-bold text-white flex items-center gap-2">
                   <Fire size={16} weight="fill" className="text-orange-400" />
                   Loyalty Contract
                 </h3>
                 <LoyaltyBadge tier={selectedCard.loyaltyTier || 'none'} size="md" />
               </div>
               <LoyaltyProgressBar count={selectedCard.loyaltyCount || 0} tier={selectedCard.loyaltyTier || 'none'} />

               {/* Milestone History */}
               <div className="space-y-2 mt-4">
                 <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Milestones</p>
                 {MILESTONE_ORDER.map(tier => {
                   const info = LOYALTY_TIERS[tier];
                   const milestones = (selectedCard.loyaltyMilestones || []) as any[];
                   const completed = milestones.find((m: any) => m.tier === tier);
                   const battlesRemaining = Math.max(0, info.threshold - (selectedCard.loyaltyCount || 0));
                   
                   return (
                     <div
                       key={tier}
                       className={clsx(
                         'flex items-center gap-3 px-3 py-2 rounded-lg border text-xs',
                         completed
                           ? 'border-white/10 bg-white/5'
                           : 'border-slate-800 bg-slate-950/50 opacity-60'
                       )}
                     >
                       <span className="text-sm">{info.icon}</span>
                       <div className="flex-1 min-w-0">
                         <p className="font-bold" style={{ color: completed ? info.color : '#64748b' }}>
                           {info.title}
                           <span className="text-slate-500 font-normal ml-1">({info.threshold} battles)</span>
                         </p>
                         <p className="text-[10px] text-slate-500">
                           +{info.atkDefBonus}% ATK/DEF{info.hpBonus > 0 ? `, +${info.hpBonus}% HP` : ''}
                         </p>
                       </div>
                       <div className="text-right flex-shrink-0">
                         {completed ? (
                           <span className="text-[10px] text-green-400 font-bold">
                             ✓ {new Date(completed.unlockedAt).toLocaleDateString()}
                           </span>
                         ) : (
                           <span className="text-[10px] text-slate-500 font-mono">
                             {battlesRemaining} left
                           </span>
                         )}
                       </div>
                     </div>
                   );
                 })}
               </div>

               {/* Lifetime Stats */}
               {selectedCard.lifetimeStats && (
                 <div className="mt-3 pt-3 border-t border-slate-800">
                   <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-2">Lifetime Stats</p>
                   <div className="grid grid-cols-2 gap-2">
                     <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-2 text-center">
                       <p className="text-lg font-black text-red-400">{(selectedCard.lifetimeStats.damageDealt || 0).toLocaleString()}</p>
                       <p className="text-[9px] text-slate-500 uppercase">Damage Dealt</p>
                     </div>
                     <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-2 text-center">
                       <p className="text-lg font-black text-emerald-400">{selectedCard.lifetimeStats.battlesWon || 0}</p>
                       <p className="text-[9px] text-slate-500 uppercase">Battles Won</p>
                     </div>
                     <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-2 text-center">
                       <p className="text-lg font-black text-yellow-400">{selectedCard.lifetimeStats.critsLanded || 0}</p>
                       <p className="text-[9px] text-slate-500 uppercase">Crits Landed</p>
                     </div>
                     <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-2 text-center">
                       <p className="text-lg font-black text-purple-400">{selectedCard.lifetimeStats.passivesTriggered || 0}</p>
                       <p className="text-[9px] text-slate-500 uppercase">Passives Used</p>
                     </div>
                   </div>
                 </div>
               )}
             </div>
          </div>
        </div>
      )}
      
    </div>
  );
}

const raritiesConfig = {
  'L': { label: 'Legendary', color: '#ffd700' },
  'E': { label: 'Epic', color: '#a855f7' },
  'R': { label: 'Rare', color: '#3b82f6' },
  'U': { label: 'Uncommon', color: '#22c55e' },
  'C': { label: 'Common', color: '#94a3b8' }
};
