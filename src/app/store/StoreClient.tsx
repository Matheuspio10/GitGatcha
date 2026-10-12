'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { missionRequiredCount } from '@/lib/missionUtils';
import { notifyAchievements } from '@/lib/achievementToast';
import { LOGIN_CALENDAR_REWARDS, type LoginCalendarState } from '@/lib/loginCalendar';
import { BOOSTER_SLOT_ODDS, RARITY_ORDER, averagePullRates, type Rarity } from '@/lib/rarity';
import { PITY_THRESHOLD } from '@/lib/pity';
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
  Circle,
  Package,
  ChartBar,
  CaretDown,
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

const RARITY_TEXT: Record<Rarity, string> = {
  Common: 'text-slate-300',
  Uncommon: 'text-green-400',
  Rare: 'text-blue-400',
  Epic: 'text-purple-400',
  Legendary: 'text-yellow-400',
};

function formatPercent(p: number): string {
  const v = Math.round(p * 1000) / 10;
  return `${v}%`;
}

interface PityStatus {
  packsSinceLegendary: number;
  packsUntilGuaranteed: number;
  threshold: number;
}

/** 7-day login calendar: claimed / today / upcoming days, booster on day 7. */
function LoginCalendar({ streak, cooldownMs }: { streak: LoginCalendarState | null; cooldownMs: number }) {
  const days = streak?.days ?? LOGIN_CALENDAR_REWARDS.map(r => ({ ...r, state: 'upcoming' as const }));
  return (
    <div className="w-full max-w-3xl mx-auto mt-6">
      <div className="flex items-center justify-between gap-2 mb-2 text-xs text-slate-400 flex-wrap">
        <span className="font-bold uppercase tracking-wider">Login Calendar</span>
        {streak && (
          <span>
            {streak.claimedDay > 0 ? `Streak: day ${streak.claimedDay} of 7` : 'Claim daily to build a streak'}
            {streak.streakExpiresAt && !streak.canClaim ? ' · claim within 48h to keep it' : ''}
          </span>
        )}
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
        {days.map(d => {
          const isNext = !!streak && !streak.canClaim && d.day === streak.nextDay;
          return (
            <div
              key={d.day}
              className={`relative rounded-xl border p-2 flex flex-col items-center gap-1 text-center transition-all ${
                d.state === 'claimed'
                  ? 'border-green-500/30 bg-green-500/10 text-green-300'
                  : d.state === 'today'
                    ? 'border-emerald-400 bg-emerald-500/15 text-white shadow-[0_0_16px_rgba(16,185,129,0.35)]'
                    : isNext
                      ? 'border-slate-500 bg-slate-800/80 text-slate-200'
                      : 'border-slate-700 bg-slate-900/60 text-slate-400'
              }`}
              aria-label={`Day ${d.day}: ${d.bits} Bits${d.packId ? ' and a booster' : ''} (${d.state})`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider">Day {d.day}</span>
              {d.packId ? (
                <Package size={22} weight="duotone" className="text-purple-300" />
              ) : (
                <Coin size={20} weight="fill" className={d.state === 'upcoming' ? 'text-yellow-600' : 'text-yellow-400'} />
              )}
              <span className="text-xs font-black">{d.bits}</span>
              {d.packId && <span className="text-[9px] leading-tight text-purple-300">+ {d.packName}</span>}
              {d.state === 'claimed' && <CheckCircle size={14} weight="fill" className="absolute top-1 right-1 text-green-400" />}
              {d.state === 'today' && <span className="text-[9px] font-bold text-emerald-300 uppercase">Today</span>}
              {isNext && <span className="text-[9px] font-mono text-slate-400">{formatCountdown(cooldownMs)}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Pity counter and the per-slot odds of a standard booster. */
function DropRatesPanel({ pity }: { pity: PityStatus | null }) {
  const [open, setOpen] = useState(false);
  const average = averagePullRates();
  return (
    <div className="w-full max-w-3xl mx-auto rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          {pity ? (
            <>
              <div className="text-sm font-bold text-yellow-300">
                {pity.packsUntilGuaranteed <= 1
                  ? 'Legendary guaranteed in your next pack!'
                  : `Legendary guaranteed within ${pity.packsUntilGuaranteed} packs`}
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-yellow-600 to-yellow-300"
                  style={{ width: `${Math.min(100, (Math.min(pity.packsSinceLegendary, pity.threshold - 1) / Math.max(1, pity.threshold - 1)) * 100)}%` }}
                />
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-500">Legendary guaranteed at least every {PITY_THRESHOLD} packs</div>
          )}
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-300 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700"
          aria-expanded={open}
        >
          <ChartBar size={14} weight="bold" /> Drop rates
          <CaretDown size={12} weight="bold" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-slate-500 uppercase tracking-wider">
                <th className="py-1 pr-2 font-bold">Card</th>
                {RARITY_ORDER.map(r => <th key={r} className={`py-1 px-2 font-bold ${RARITY_TEXT[r]}`}>{r}</th>)}
              </tr>
            </thead>
            <tbody className="text-slate-300 font-mono">
              {BOOSTER_SLOT_ODDS.map((odds, i) => (
                <tr key={i} className="border-t border-slate-800">
                  <td className="py-1 pr-2 text-slate-400 font-sans">#{i + 1}{i === BOOSTER_SLOT_ODDS.length - 1 ? '+' : ''}</td>
                  {RARITY_ORDER.map(r => <td key={r} className="py-1 px-2">{odds[r] ? formatPercent(odds[r]!) : '—'}</td>)}
                </tr>
              ))}
              <tr className="border-t border-slate-700 font-bold">
                <td className="py-1 pr-2 text-slate-400 font-sans">Average</td>
                {RARITY_ORDER.map(r => <td key={r} className="py-1 px-2">{formatPercent(average[r])}</td>)}
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
            Odds of each card of a booster, before the star bonus (a developer with enough stars is promoted one rarity on reveal).
            Packs marked &quot;≥1&quot; upgrade their lowest card to that rarity. After {(pity?.threshold ?? PITY_THRESHOLD) - 1} packs in a row
            without a Legendary, the next pack&apos;s last card is a Legendary. All-Common packs don&apos;t count towards the pity.
          </p>
        </div>
      )}
    </div>
  );
}

/** Tells the Navbar (and anything else listening) to re-fetch the BITS balance. */
function refreshBits() {
  window.dispatchEvent(new Event('bits:refresh'));
}

interface UserMissionInfo {
  id: string;
  progress: number;
  completed: boolean;
  /** Progress needed to complete (added by getUserMissions). */
  required?: number;
  mission: { description: string; reward: number; type: string; targetValue: string | null };
}

/** Progress needed to finish a mission ("0 / 1" rather than "0 / Rare"). */
function requiredFor(um: UserMissionInfo): number {
  return typeof um.required === 'number'
    ? um.required
    : missionRequiredCount(um.mission?.type ?? '', um.mission?.targetValue);
}

export default function StoreClient({ 
  userCurrency,
  initialMissions,
  missionsResetAt,
}: { 
  userCurrency: number;
  initialMissions: UserMissionInfo[];
  /** ISO time of the next daily mission refresh (midnight UTC). */
  missionsResetAt?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState(userCurrency);
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('language');
  const [dailyCooldown, setDailyCooldown] = useState<number>(-1);
  const [claimingDaily, setClaimingDaily] = useState(false);
  const [streak, setStreak] = useState<LoginCalendarState | null>(null);
  const [pity, setPity] = useState<PityStatus | null>(null);
  const [missionResetMs, setMissionResetMs] = useState<number | null>(null);
  // Pack targeted by a `/store#pack-<id>` link (e.g. the Forge recommendation)
  const [highlightPackId, setHighlightPackId] = useState<string | null>(null);
  
  // Notification state
  const [purchaseNotification, setPurchaseNotification] = useState<{ packName: string } | null>(null);
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

  // Deep link: `#pack-<id>` opens the pack's category, scrolls to it and highlights it
  useEffect(() => {
    const readHash = () => {
      const match = window.location.hash.match(/^#pack-(.+)$/);
      setHighlightPackId(match ? decodeURIComponent(match[1]) : null);
    };
    readHash();
    window.addEventListener('hashchange', readHash);
    return () => window.removeEventListener('hashchange', readHash);
  }, []);

  useEffect(() => {
    if (!highlightPackId) return;
    const pack = packs.find(p => p.id === highlightPackId);
    if (!pack) return; // catalog not loaded yet
    setActiveCategory(pack.category);
    const scroll = setTimeout(() => {
      document.getElementById(`pack-${pack.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350); // after the category grid animates in
    const clear = setTimeout(() => setHighlightPackId(null), 4000);
    return () => { clearTimeout(scroll); clearTimeout(clear); };
  }, [highlightPackId, packs]);

  // Daily reward / login calendar state
  const loadDaily = () => {
    fetch('/api/store/daily')
      .then(res => res.json())
      .then(data => {
        if (data.streak) setStreak(data.streak);
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
  };
  useEffect(() => { loadDaily(); }, []);

  // Legendary pity counter
  useEffect(() => {
    fetch('/api/store/pity')
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data && typeof data.packsUntilGuaranteed === 'number') setPity(data); })
      .catch(console.error);
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

  // Countdown over: reload the calendar so the next day shows as claimable
  useEffect(() => {
    if (dailyCooldown === 0 && streak && !streak.canClaim) loadDaily();
  }, [dailyCooldown, streak]);

  // Countdown to the next daily missions; reloads them once the day rolls over
  useEffect(() => {
    if (!missionsResetAt) return;
    const resetAt = new Date(missionsResetAt).getTime();
    let refreshed = false;
    const tick = () => {
      const remaining = resetAt - Date.now();
      setMissionResetMs(Math.max(0, remaining));
      if (remaining <= 0 && !refreshed) {
        refreshed = true;
        router.refresh();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [missionsResetAt, router]);

  const handleClaimDaily = async () => {
    setClaimingDaily(true);
    try {
      const res = await fetch('/api/store/daily', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setCurrency(data.newCurrency);
        setDailyCooldown(data.streak?.remainingMs || 24 * 60 * 60 * 1000);
        if (data.streak) setStreak(data.streak);
        toast.success(`${data.day ? `Day ${data.day}: ` : ''}+${data.amount ?? 100} Bits claimed!`);
        if (data.packGranted) {
          toast.success(`${data.packGranted.packName} added to your inventory!`, { icon: '📦' });
        }
        refreshBits();
        notifyAchievements(data.achievementsUnlocked);
        router.refresh();
      } else if (data.remainingMs) {
        if (data.streak) setStreak(data.streak);
        setDailyCooldown(data.remainingMs);
      } else {
        toast.error(data.error || 'Failed to claim daily reward');
      }
    } catch (e) {
      console.error(e);
      toast.error('Network error');
    } finally {
      setClaimingDaily(false);
    }
  };

  const handlePurchasePack = async (pack: PackInfo) => {
    if (currency < pack.cost) {
      toast.error('Not enough Bits!');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch('/api/store/booster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: pack.id }),
      });
      const data = await res.json();
      
      if (data.success) {
        setCurrency(data.newCurrency);
        setPurchaseNotification({ packName: data.packName });
        refreshBits();
        
        // Auto hide notification
        setTimeout(() => {
          setPurchaseNotification(null);
        }, 5000);
        
        router.refresh();
      } else {
        toast.error(data.error || 'Failed to purchase');
      }
    } catch(e) {
      console.error(e);
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  };

  const filteredPacks = packs.filter(p => p.category === activeCategory);

  return (
    <div className="flex flex-col min-h-screen gap-8 pt-8 px-4 max-w-7xl mx-auto pb-24 relative">
      
      {/* Purchase Notification Toast */}
      <AnimatePresence>
        {purchaseNotification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-green-500/30 rounded-2xl p-4 shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex flex-col md:flex-row items-center gap-6"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
                <CheckCircle weight="fill" size={24} />
              </div>
              <div>
                <h4 className="font-bold text-white">Purchase Successful</h4>
                <p className="text-sm text-slate-400">{purchaseNotification.packName} added to your inventory.</p>
              </div>
            </div>
            <button
              onClick={() => router.push('/inventory')}
              className="px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors whitespace-nowrap"
            >
              Go to Inventory →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

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
                  : `Claim Day ${streak?.nextDay ?? 1}: ${streak?.nextReward.bits ?? 100} Bits${streak?.nextReward.packId ? ' + Pack' : ''}`
            }
          </button>
        </div>

        <LoginCalendar streak={streak} cooldownMs={Math.max(0, dailyCooldown)} />
      </div>

      <DropRatesPanel pity={pity} />

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
            id={`pack-${pack.id}`}
            whileHover={{ scale: 1.05, y: -8 }}
            whileTap={{ scale: 0.98 }}
            className={`group cursor-pointer relative mx-auto w-full max-w-[280px] rounded-2xl transition-shadow ${highlightPackId === pack.id ? 'ring-4 ring-indigo-400 ring-offset-4 ring-offset-slate-950 animate-pulse' : ''}`}
            onClick={() => {
              if (loading) return;
              handlePurchasePack(pack);
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
              <div className="absolute inset-0 tex-cubes opacity-20 mix-blend-overlay pointer-events-none" />
              <div className="absolute top-0 w-full h-8 border-b-2 pointer-events-none" style={{ backgroundColor: pack.visualTheme.border + '40', borderColor: pack.visualTheme.border + '60' }} />
              <div className="absolute bottom-0 w-full h-8 border-t-2 pointer-events-none" style={{ backgroundColor: pack.visualTheme.border + '40', borderColor: pack.visualTheme.border + '60' }} />
              
              {/* Foil Tear Line Indicator */}
              <div className="absolute top-10 left-0 right-0 border-t-2 border-dashed border-white/30 pointer-events-none" />

              {/* Branding Wrapper */}
              <div className="relative z-10 flex flex-col items-center text-center mt-16 px-4">
                <h3 
                  className="text-3xl font-black tracking-tighter mb-1 leading-none [text-shadow:0_2px_4px_rgba(0,0,0,0.8)]" 
                  style={{ color: pack.visualTheme.textColor }}
                >
                  {pack.name}
                </h3>
                <div 
                  className="text-[10px] font-bold uppercase tracking-[0.3em] mb-6 bg-slate-900/40 backdrop-blur-sm border border-white/20 px-3 py-1 rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]" 
                  style={{ color: pack.visualTheme.textColor }}
                >
                  {pack.cardCount} Cards
                </div>
                
                <p className="text-sm font-medium leading-snug line-clamp-4 mix-blend-luminosity opacity-90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" style={{ color: pack.visualTheme.textColor }}>
                  {pack.noPreview ? '??? Unknown Contents' : pack.description}
                </p>
              </div>

              {/* Information Badges Container */}
              <div className="absolute top-14 right-[-2.5rem] rotate-45 z-20 w-32 text-center shadow-[0_4px_0_rgba(0,0,0,0.4)]">
                  {pack.guaranteedMinRarity && (
                    <div 
                      className="text-[10px] font-black uppercase tracking-[0.2em] py-1 border-y border-white/20"
                      style={{ backgroundColor: getRarityBadgeColor(pack.guaranteedMinRarity), color: '#000' }}
                    >
                      ≥1 {pack.guaranteedMinRarity}
                    </div>
                  )}
                  {pack.allCommon && (
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] py-1 bg-slate-200 text-slate-800 border-y border-white/40">
                      Common
                    </div>
                  )}
                  {pack.noPreview && (
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] py-1 bg-purple-600 text-purple-50 border-y border-purple-400/50 animate-pulse">
                      Mystery
                    </div>
                  )}
              </div>

              {/* Cost Button */}
              <div className="absolute bottom-12 w-3/4 py-3 rounded-full bg-slate-900/60 backdrop-blur-md border border-white/10 text-white font-bold text-lg shadow-[0_10px_20px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)] flex items-center justify-center gap-2 group-hover:bg-slate-900/80 transition-colors">
                <span className="text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.8)] font-black">{pack.cost}</span>
                <span className="text-[10px] text-yellow-400/90 uppercase tracking-[0.2em] mt-1 font-bold">Bits</span>
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
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <h2 className="text-3xl font-bold flex items-center gap-3">
            Daily Standup <span className="text-sm font-normal text-slate-400 px-3 py-1 bg-slate-800 rounded-full border border-slate-700">Missions</span>
          </h2>
          {missionResetMs !== null && (
            <span className="text-sm text-slate-400 font-mono">
              New missions in {missionResetMs > 0 ? formatCountdown(missionResetMs) : 'a moment...'}
            </span>
          )}
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
                      {Math.min(um.progress, requiredFor(um))} / {requiredFor(um)}
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
