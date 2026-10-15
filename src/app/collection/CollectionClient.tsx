'use client';

import { useState, useMemo } from 'react';
import { EmptyState } from '@/components/EmptyState';
import toast from 'react-hot-toast';
import { CardProps, Card } from '@/components/Card';
import { CaretLeft, CaretRight, Star, ListDashes, SquaresFour, GithubLogo, X, Lightning, Fire, BookOpenText, ShareNetwork } from '@phosphor-icons/react';
import { claimShareBonus, copyText } from '@/components/ShareButtons';
import { calculateCurrentStamina } from '@/lib/staminaUtils';
import { TRAINING_BONUS_PER_LEVEL } from '@/lib/training';
import { TrainingPanel } from '@/components/TrainingPanel';
import { GiftPanel } from '@/components/GiftPanel';
import { CardDownloadButton } from '@/components/CardDownloadButton';
import { LanguageSets } from '@/components/LanguageSets';
import { collectionProgress } from '@/lib/collections';
import { pressable, useDialog } from '@/lib/useDialog';
import clsx from 'clsx';
import type { LifetimeStats, SavedMilestone } from '@/lib/loyaltyService';
import { useLocale, useTranslations } from 'next-intl';

type ExtendedCard = CardProps & {
  shards?: number;
  userCardId?: string;
  isShiny?: boolean;
  edition?: string;
  loyaltyCount?: number;
  loyaltyTier?: string;
  loyaltyMilestones?: SavedMilestone[];
  lifetimeStats?: LifetimeStats | null;
  showcaseOrder?: number | null;
  trainingLevel?: number;
};

type SortOption = 'RARITY' | 'NAME' | 'TYPE' | 'HP' | 'ATK' | 'DEF' | 'COUNT' | 'LOYALTY';

const CORE_LANGUAGES = ['JavaScript', 'TypeScript', 'Python', 'Rust', 'Go', 'Ruby', 'C', 'C++', 'CSS', 'PHP'];

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

// Tier titles are translated: collection.loyalty.tiers.<key>
const LOYALTY_TIERS: Record<string, { title: string; color: string; icon: string; atkDefBonus: number; hpBonus: number; threshold: number }> = {
  none: { title: '', color: '#475569', icon: '', atkDefBonus: 0, hpBonus: 0, threshold: 0 },
  veteran: { title: 'Veteran', color: '#a78bfa', icon: '⭐', atkDefBonus: 3, hpBonus: 0, threshold: 10 },
  trusted: { title: 'Trusted', color: '#fbbf24', icon: '🛡️', atkDefBonus: 7, hpBonus: 0, threshold: 25 },
  reliable: { title: 'Reliable', color: '#f97316', icon: '🔥', atkDefBonus: 12, hpBonus: 0, threshold: 50 },
  legendary_bond: { title: 'Legendary Bond', color: '#ec4899', icon: '💎', atkDefBonus: 18, hpBonus: 5, threshold: 100 },
  eternal: { title: 'Eternal', color: '#06b6d4', icon: '♾️', atkDefBonus: 25, hpBonus: 10, threshold: 200 },
};

const MILESTONE_ORDER = ['veteran', 'trusted', 'reliable', 'legendary_bond', 'eternal'] as const;
type MilestoneTier = (typeof MILESTONE_ORDER)[number];

function isMilestoneTier(tier: string): tier is MilestoneTier {
  return (MILESTONE_ORDER as readonly string[]).includes(tier);
}

const SORT_LABEL_KEYS = {
  RARITY: 'rarity',
  NAME: 'name',
  TYPE: 'type',
  HP: 'hp',
  ATK: 'atk',
  DEF: 'def',
  COUNT: 'count',
  LOYALTY: 'loyalty',
} as const satisfies Record<SortOption, string>;

function getNextMilestone(count: number): { tier: MilestoneTier; threshold: number } | null {
  for (const tier of MILESTONE_ORDER) {
    if (count < LOYALTY_TIERS[tier].threshold) {
      return { tier, threshold: LOYALTY_TIERS[tier].threshold };
    }
  }
  return null;
}

function LoyaltyBadge({ tier, size = 'sm' }: { tier: string; size?: 'sm' | 'md' | 'lg' }) {
  const t = useTranslations('collection.loyalty.tiers');
  const info = LOYALTY_TIERS[tier];
  if (!info || !isMilestoneTier(tier)) return null;

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
      <span>{t(tier)}</span>
    </span>
  );
}

function LoyaltyProgressBar({ count }: { count: number }) {
  const t = useTranslations('collection.loyalty');
  const next = getNextMilestone(count);

  if (!next) {
    // Eternal tier - max reached
    const info = LOYALTY_TIERS.eternal;
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold" style={{ color: info.color }}>{t('maxed')}</span>
        <span className="text-[9px] text-slate-500 font-mono">{t('battles', { count })}</span>
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
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{t('label')}</span>
        <span className="text-[9px] font-mono text-slate-400">
          {count} / {next.threshold} <span className="text-slate-500">→</span>{' '}
          <span style={{ color: nextInfo.color }}>{t(`tiers.${next.tier}`)}</span>
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

/** Empty collection (go open packs) or a search/filter with no match (clear the search). */
function CollectionEmpty({ hasCards, onClear }: { hasCards: boolean; onClear: () => void }) {
  const t = useTranslations('collection.empty');
  return hasCards ? (
    <EmptyState title={t('noMatchTitle')} text={t('noMatchText')} actions={[{ label: t('clearSearch'), onClick: onClear }]} compact />
  ) : (
    <EmptyState
      title={t('emptyTitle')}
      text={t('emptyText')}
      actions={[{ label: t('openPack'), href: '/inventory' }, { label: t('visitStore'), href: '/store' }]}
    />
  );
}

export default function CollectionClient({ initialCards, profileHref }: { initialCards: ExtendedCard[]; profileHref?: string }) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('RARITY');
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'LIST' | 'GRID'>('LIST');
  const [selectedCard, setSelectedCard] = useState<ExtendedCard | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [localCards, setLocalCards] = useState<ExtendedCard[]>(initialCards);
  const cardDialogRef = useDialog(!!selectedCard, () => setSelectedCard(null));
  const t = useTranslations('collection');
  const tShare = useTranslations('common.share');
  const locale = useLocale();
  const itemsPerPage = 20;

  // Global Collection Stats calculations
  const totalUnique = localCards.length;
  // Every pull of a card, duplicates included (UserCard.quantity)
  const totalPulls = localCards.reduce((acc, card) => acc + (card.quantity || 1), 0);

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

  const sets = useMemo(() => collectionProgress(localCards), [localCards]);

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
        case 'TYPE':
          comparison = (a.primaryLanguage || '').localeCompare(b.primaryLanguage || '');
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
          comparison = (a.quantity || 1) - (b.quantity || 1);
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
        toast.error(data.error || t('dialog.recoverFailed'));
      } else {
        window.dispatchEvent(new Event('bits:refresh'));
        // Optimistically update the local state to 100 stamina
        setLocalCards(prev => prev.map(c => 
          c.userCardId === card.userCardId 
            ? { ...c, stamina: 100, lastUsedAt: new Date().toISOString() } 
            : c
        ));
        if (selectedCard && selectedCard.userCardId === card.userCardId) {
          setSelectedCard({ ...selectedCard, stamina: 100, lastUsedAt: new Date().toISOString() });
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(t('dialog.genericError'));
    } finally {
      setRecovering(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* 1. Stats Dashboard Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-800 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-2">
            <h1 className="text-2xl font-black text-white">{t('stats.title')}</h1>
            <a href="/wiki#cards-and-rarities" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1.5 font-medium">
              <BookOpenText size={18} weight="bold" /> {t('stats.wiki')}
            </a>
          </div>
          <div className="text-sm text-slate-400 font-medium px-2">
            {t('stats.uniqueCards')} <span className="text-white font-bold text-base">{totalUnique}</span>{' '}
            <span className="text-slate-500 mx-2">|</span>{' '}
            {t('stats.totalPulls')} <span className="text-white font-bold text-base">{totalPulls}</span>
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

      <LanguageSets sets={sets} profileHref={profileHref} />

      {/* 2. Toolbar & Sorting */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-slate-800 rounded-lg p-1 mr-2 md:mr-4">
              <button 
                onClick={() => setViewMode('LIST')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'LIST' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                title={t('toolbar.listView')}
              >
                <ListDashes size={18} weight="bold" />
              </button>
              <button 
                onClick={() => setViewMode('GRID')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'GRID' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                title={t('toolbar.gridView')}
              >
                <SquaresFour size={18} weight="bold" />
              </button>
            </div>
            <span className="text-sm text-slate-400 mr-2">{t('toolbar.sortBy')}</span>
            {(['RARITY', 'NAME', 'TYPE', 'HP', 'ATK', 'DEF', 'COUNT', 'LOYALTY'] as SortOption[]).map(opt => (
              <button
                key={opt}
                onClick={() => handleSort(opt)}
                className={`text-xs font-bold px-3 py-1.5 rounded transition-colors ${
                  sortBy === opt 
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {t(`sort.${SORT_LABEL_KEYS[opt]}`)} {sortBy === opt ? (sortDesc ? '↓' : '↑') : ''}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-4 w-full md:w-auto">
             <div className="flex items-center gap-2 text-sm text-slate-400">
               <span>{t('toolbar.page')}</span>
               <div className="bg-black/50 border border-slate-700 rounded px-3 py-1 text-white font-mono">
                 {page}
               </div>
               <span>{t('toolbar.of', { total: totalPages })}</span>
               
               <div className="flex gap-1 ml-2">
                 <button 
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  aria-label={t('toolbar.previousPage')}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white transition-colors"
                 >
                   <CaretLeft weight="bold" />
                 </button>
                 <button 
                  disabled={page === totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  aria-label={t('toolbar.nextPage')}
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
             placeholder={t('toolbar.search')} 
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
                  <th className="px-6 py-4">{t('table.rank')}</th>
                  <th className="px-6 py-4">{t('table.title')}</th>
                  <th className="px-6 py-4 text-center">{t('table.type')}</th>
                  <th className="px-6 py-4 text-right">{t('table.hp')}</th>
                  <th className="px-6 py-4 text-right">{t('table.atk')}</th>
                  <th className="px-6 py-4 text-right">{t('table.def')}</th>
                  <th className="px-6 py-4 text-center">{t('table.stamina')}</th>
                  <th className="px-6 py-4 text-center">{t('table.loyalty')}</th>
                  <th className="px-6 py-4 text-right">{t('table.count')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-6">
                      <CollectionEmpty hasCards={localCards.length > 0} onClear={() => { setSearch(''); setPage(1); }} />
                    </td>
                  </tr>
                ) : (
                  paginatedData.map(card => {
                    const qty = card.quantity || 1;
                    const rarityColor = RARITY_COLORS[card.rarity] || '#fff';
                    const abbr = RARITY_ABBR[card.rarity] || 'UNK';
                    const loyaltyCount = card.loyaltyCount || 0;
                    const loyaltyTier = card.loyaltyTier || 'none';
                    
                    return (
                      <tr 
                        key={card.userCardId || `${card.githubUsername}-${Math.random()}`} 
                        onClick={() => setSelectedCard(card)} 
                        // Rows keep their table semantics; Enter or Space opens the card like a click
                        tabIndex={0}
                        aria-label={t('table.openDetails', { name: card.name, rarity: card.rarity })}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedCard(card); } }}
                        className="hover:bg-slate-900/50 focus-visible:bg-slate-900/70 focus-visible:outline-2 focus-visible:outline-brand-b transition-colors group cursor-pointer"
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
                            <span className="text-xs text-slate-500 font-mono">@{card.githubUsername}</span>
                            <LoyaltyBadge tier={loyaltyTier} size="sm" />
                            {(card.trainingLevel ?? 0) > 0 && (
                              <span className="inline-flex items-center rounded-full border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold text-sky-300" title={t('table.trainingLevel', { level: card.trainingLevel ?? 0 })}>
                                +{Math.round((card.trainingLevel ?? 0) * TRAINING_BONUS_PER_LEVEL * 100)}%
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={clsx(
                            "inline-block px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded border",
                            CORE_LANGUAGES.includes(card.primaryLanguage || 'Unknown')
                              ? "bg-indigo-900/50 border-indigo-500/50 text-indigo-200"
                              : "bg-slate-800/50 border-slate-600/50 text-slate-400"
                          )} title={CORE_LANGUAGES.includes(card.primaryLanguage || 'Unknown') ? t('table.coreType') : t('table.neutralType')}>
                            {card.primaryLanguage || 'Unknown'} {CORE_LANGUAGES.includes(card.primaryLanguage || 'Unknown') ? '' : t('table.neutral')}
                          </span>
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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(256px,1fr))] justify-items-center gap-x-5 gap-y-8">
          {paginatedData.length === 0 ? (
            <div className="col-span-full w-full">
              <CollectionEmpty hasCards={localCards.length > 0} onClear={() => { setSearch(''); setPage(1); }} />
            </div>
          ) : (
            paginatedData.map(card => (
              <div 
                key={card.userCardId || `${card.githubUsername}-${Math.random()}`} 
                {...pressable(() => setSelectedCard(card), t('table.openDetails', { name: card.name, rarity: card.rarity }))}
                className="cursor-pointer flex justify-center w-full rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-b"
              >
                 <Card
                   {...card}
                   quantity={card.quantity || 1}
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
          <div
            ref={cardDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('dialog.label', { name: selectedCard.name })}
            className="relative flex flex-col md:flex-row items-center md:items-start justify-center gap-6 w-full max-w-5xl my-auto"
            onClick={e => e.stopPropagation()}
          >
             <button 
               onClick={() => setSelectedCard(null)}
               aria-label={t('dialog.close')}
               className="absolute -top-2 right-0 md:-right-12 text-slate-400 hover:text-white transition-colors bg-black/50 p-2 rounded-full border border-slate-700 z-10"
             >
               <X size={24} />
             </button>
             
             <div className="flex flex-col items-center flex-shrink-0 mt-4 md:mt-0 xl:mr-8 origin-top">
               <div className="pointer-events-none scale-90 sm:scale-100 xl:scale-110 origin-top mb-2 sm:mb-4 xl:mb-12">
                 <Card
                   {...selectedCard}
                   quantity={selectedCard.quantity || 1}
                   disableLink={true}
                   loyaltyTier={selectedCard.loyaltyTier}
                   loyaltyCount={selectedCard.loyaltyCount}
                 />
               </div>
               
               {/* Buttons below the card */}
               <div className="flex flex-row gap-3 items-center justify-center w-full max-w-[280px] relative z-20">
                 <a 
                   href={`https://github.com/${selectedCard.githubUsername}`}
                   target="_blank"
                   rel="noopener noreferrer"
                   className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-[0_0_15px_rgba(79,70,229,0.3)] transition-all hover:scale-105 text-sm"
                 >
                   <GithubLogo size={18} weight="fill" />
                   {t('dialog.openProfile')}
                 </a>

                 <button
                   onClick={async () => {
                     await copyText(`${window.location.origin}/card/${selectedCard.githubUsername}`, tShare('copyPrompt'));
                     toast.success(t('dialog.linkCopied'));
                     claimShareBonus(bits => tShare('firstShareBonus', { bits }));
                   }}
                   className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold rounded-xl transition-all text-sm"
                   title={t('dialog.shareTitle')}
                 >
                   <ShareNetwork size={18} />
                   {t('dialog.share')}
                 </button>

                 <CardDownloadButton
                   login={selectedCard.githubUsername}
                   signature={selectedCard.edition === 'signature'}
                   label="PNG"
                   className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold rounded-xl transition-all text-sm"
                 />

                 {selectedCard.stamina !== undefined && calculateCurrentStamina(selectedCard.stamina, selectedCard.lastUsedAt ? new Date(selectedCard.lastUsedAt) : new Date(), selectedCard.inActiveTeam || false) < 100 && (
                   <button
                     onClick={() => handleRecoverStamina(selectedCard)}
                     disabled={recovering}
                     className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all hover:scale-105 text-sm disabled:opacity-50 disabled:hover:scale-100"
                   >
                     <Lightning size={18} weight="fill" />
                     {recovering ? t('dialog.recovering') : t('dialog.cure')}
                   </button>
                 )}
               </div>
             </div>

             <div className="w-full max-w-md flex flex-col gap-4">
             {/* Training (BITS + fragments → battle bonus) */}
             <TrainingPanel
               key={selectedCard.userCardId}
               card={selectedCard}
               onTrained={trainingLevel => {
                 setSelectedCard(prev => (prev ? { ...prev, trainingLevel } : prev));
                 setLocalCards(prev => prev.map(c => (c.userCardId === selectedCard.userCardId ? { ...c, trainingLevel } : c)));
               }}
             />

             {/* Gift to a friend (the card leaves the collection) */}
             {selectedCard.edition !== 'signature' && <GiftPanel
               key={`gift-${selectedCard.id}`}
               cardId={selectedCard.id!}
               onGiven={() => {
                 setLocalCards(prev => prev.filter(c => c.userCardId !== selectedCard.userCardId));
                 setSelectedCard(null);
               }}
             />}

             {/* Loyalty Progress Section */}
             <div className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4">
               <div className="flex items-center justify-between">
                 <h3 className="text-sm font-bold text-white flex items-center gap-2">
                   <Fire size={16} weight="fill" className="text-orange-400" />
                   {t('loyalty.contract')}
                 </h3>
                 <LoyaltyBadge tier={selectedCard.loyaltyTier || 'none'} size="md" />
               </div>
               <LoyaltyProgressBar count={selectedCard.loyaltyCount || 0} />

               {/* Milestone History */}
               <div className="space-y-2 mt-4">
                 <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{t('loyalty.milestones')}</p>
                 {MILESTONE_ORDER.map(tier => {
                   const info = LOYALTY_TIERS[tier];
                   const milestones = selectedCard.loyaltyMilestones || [];
                   const completed = milestones.find(m => m.tier === tier);
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
                           {t(`loyalty.tiers.${tier}`)}
                           <span className="text-slate-500 font-normal ml-1">{t('loyalty.threshold', { count: info.threshold })}</span>
                         </p>
                         <p className="text-[10px] text-slate-500">
                           +{info.atkDefBonus}% ATK/DEF{info.hpBonus > 0 ? `, +${info.hpBonus}% HP` : ''}
                         </p>
                       </div>
                       <div className="text-right flex-shrink-0">
                         {completed ? (
                           <span className="text-[10px] text-green-400 font-bold">
                             ✓ {new Date(completed.unlockedAt).toLocaleDateString(locale)}
                           </span>
                         ) : (
                           <span className="text-[10px] text-slate-500 font-mono">
                             {t('loyalty.left', { count: battlesRemaining })}
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
                   <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-2">{t('loyalty.lifetime')}</p>
                   <div className="grid grid-cols-2 gap-2">
                     <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-2 text-center">
                       <p className="text-lg font-black text-red-400">{(selectedCard.lifetimeStats.damageDealt || 0).toLocaleString(locale)}</p>
                       <p className="text-[9px] text-slate-500 uppercase">{t('loyalty.damageDealt')}</p>
                     </div>
                     <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-2 text-center">
                       <p className="text-lg font-black text-emerald-400">{selectedCard.lifetimeStats.battlesWon || 0}</p>
                       <p className="text-[9px] text-slate-500 uppercase">{t('loyalty.battlesWon')}</p>
                     </div>
                     <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-2 text-center">
                       <p className="text-lg font-black text-yellow-400">{selectedCard.lifetimeStats.critsLanded || 0}</p>
                       <p className="text-[9px] text-slate-500 uppercase">{t('loyalty.critsLanded')}</p>
                     </div>
                     <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-2 text-center">
                       <p className="text-lg font-black text-purple-400">{selectedCard.lifetimeStats.passivesTriggered || 0}</p>
                       <p className="text-[9px] text-slate-500 uppercase">{t('loyalty.passivesUsed')}</p>
                     </div>
                   </div>
                 </div>
               )}
             </div>
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
