'use client';

import React, { useState, useEffect } from 'react';
import { WILDCARD, WILDCARD_EXCHANGE_RATE, maxWildcardsFrom, needsWildcards, planFragmentPayment } from '@/lib/fragments';
import { EmptyState } from '@/components/EmptyState';
import { Card } from '@/components/Card';
import { useSession } from 'next-auth/react';
import { MagnifyingGlass, ClockCounterClockwise, Star, Sparkle, Hammer, Coin, BookOpenText } from '@phosphor-icons/react';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import { formatSeasonLeft } from '@/lib/seasons';
import { RarityGem } from '@/components/RarityGem';
import { useLocale, useTranslations } from 'next-intl';

type FragmentWallet = Record<string, number>;
type WishlistItem = {
  username: string;
  name: string;
  avatarUrl: string;
  primaryLanguage: string;
  rarity: string;
  fragmentsRequired: number;
};
type FragmentLog = {
  date: string;
  source: string;
  language: string;
  amount: number;
};

// Common icons/colors for languages
const LANG_COLORS: Record<string, string> = {
  JavaScript: 'bg-yellow-400 text-yellow-900 border-yellow-500',
  TypeScript: 'bg-blue-500 text-white border-blue-600',
  Python: 'bg-blue-400 text-white border-yellow-300',
  Rust: 'bg-orange-600 text-white border-orange-700',
  Go: 'bg-cyan-400 text-cyan-950 border-cyan-500',
  Ruby: 'bg-red-500 text-white border-red-600',
  'C++': 'bg-indigo-600 text-white border-indigo-700',
  CSS: 'bg-pink-500 text-white border-pink-600',
  HTML: 'bg-orange-500 text-white border-orange-600',
  Java: 'bg-red-600 text-white border-orange-500',
  PHP: 'bg-indigo-400 text-white border-purple-500',
  Unknown: 'bg-slate-600 text-white border-slate-700'
};

export type FeaturedDevInfo = {
  githubUsername: string;
  name: string;
  avatarUrl: string | null;
  rarity: string;
  primaryLanguage: string | null;
  discountPercent: number;
  /** Measured on the server, so it is right even when the device clock is off. */
  endsInMs: number;
};

export default function ForgeClient({ initialDev, featuredDev }: { initialDev?: string; featuredDev?: FeaturedDevInfo | null }) {
  const { data: session } = useSession();
  const t = useTranslations('forge');
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<'INVOKE' | 'WISHLIST' | 'HISTORY'>('INVOKE');
  
  const [fragments, setFragments] = useState<FragmentWallet>({});
  const [logs, setLogs] = useState<FragmentLog[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [currency, setCurrency] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  
  const [isInvoking, setIsInvoking] = useState(false);
  const [revealedCard, setRevealedCard] = useState<any>(null);

  useEffect(() => {
    fetchWallet();
  }, []);

  const fetchWallet = async () => {
    try {
      const res = await fetch('/api/forge/wallet');
      if (res.ok) {
        const data = await res.json();
        setFragments(data.fragments || {});
        setLogs(data.fragmentLogs || []);
        setWishlist(data.wishlist || []);
        setCurrency(data.currency || 0);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const searchDev = async (username: string) => {
    if (!username.trim()) return;
    setIsSearching(true);
    setSearchResult(null);
    setRevealedCard(null);

    try {
      const res = await fetch(`/api/forge/search?username=${encodeURIComponent(username.trim())}`);
      const data = await res.json();
      if (res.ok) {
        setSearchResult(data);
      } else {
        toast.error(data.error || t('toasts.notFound'));
      }
    } catch (e) {
      toast.error(t('toasts.searchFailed'));
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchDev(searchQuery);
  };

  const forgeDev = (username: string) => {
    setActiveTab('INVOKE');
    setSearchQuery(username);
    searchDev(username);
  };

  // `/forge?dev=<login>` (e.g. the Dev of the Week link) opens with that dev searched
  useEffect(() => {
    if (initialDev) forgeDev(initialDev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDev]);

  const handleInvoke = async () => {
    if (!searchResult) return;
    setIsInvoking(true);
    try {
      const res = await fetch('/api/forge/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: searchResult.stats.githubUsername })
      });
      const data = await res.json();
      if (res.ok) {
        setRevealedCard(data.card);
        fetchWallet(); // Refresh balances
        window.dispatchEvent(new Event('bits:refresh')); // Sync Navbar BITS
        toast.success(t('toasts.invoked', { name: data.card.name }));
      } else {
        toast.error(data.error || t('toasts.invokeFailed'));
      }
    } catch (e) {
      toast.error(t('toasts.invokeFailed'));
    } finally {
      setIsInvoking(false);
    }
  };

  const toggleWishlist = async (username: string) => {
    const isWished = wishlist.some(w => w.username.toLowerCase() === username.toLowerCase());
    try {
      let res;
      if (isWished) {
        res = await fetch(`/api/forge/wishlist?username=${encodeURIComponent(username)}`, { method: 'DELETE' });
      } else {
        res = await fetch('/api/forge/wishlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username })
        });
      }
      
      const data = await res.json();
      if (res.ok) {
        setWishlist(data.wishlist);
        toast.success(isWished ? t('toasts.wishlistRemoved') : t('toasts.wishlistAdded'));
      } else {
        toast.error(data.error || t('toasts.wishlistFailed'));
      }
    } catch (e) {
      toast.error(t('toasts.wishlistFailed'));
    }
  };

  // Derived state for invoke button
  const reqFragments = searchResult?.cost?.fragments || 0;
  const reqBits = searchResult?.cost?.bits || 0;
  const lang = searchResult?.stats?.primaryLanguage || 'Unknown';
  const onlyWildcards = needsWildcards(lang);
  const ownedFragments = onlyWildcards ? 0 : fragments[lang] || 0;
  const ownedWildcards = fragments[WILDCARD] || 0;
  // Language fragments first, wildcards for the rest (null = can't cover it)
  const payment = planFragmentPayment(fragments, lang, reqFragments);
  const usableFragments = Math.min(reqFragments, ownedFragments + ownedWildcards);

  const hasFragments = !!payment;
  const hasBits = currency >= reqBits;
  const canInvoke = hasFragments && hasBits;

  // Wallet Badges
  const renderWallet = () => {
    const activeFragments = Object.entries(fragments).filter(([_, count]) => count > 0);
    
    if (activeFragments.length === 0) return (
      <EmptyState
        compact
        title={t('emptyWallet.title')}
        text={t('emptyWallet.text')}
        actions={[{ label: t('emptyWallet.openPack'), href: '/inventory' }, { label: t('emptyWallet.visitStore'), href: '/store' }]}
      />
    );

    return (
      <div className="flex flex-wrap gap-2">
        {activeFragments.sort(([a], [b]) => (a === WILDCARD ? -1 : b === WILDCARD ? 1 : 0)).map(([l, count]) => {
          const colorClass = l === WILDCARD ? 'bg-amber-400/15 text-amber-200 border-amber-400/40' : LANG_COLORS[l] || LANG_COLORS.Unknown;
          return (
            <div key={l} className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-2 ${colorClass} shadow-md`}>
              <span>{l === WILDCARD ? t('wildcard') : l}</span>
              <span className="bg-black/20 px-1.5 rounded">{count}</span>
            </div>
          );
        })}
      </div>
    );
  };

  // Reveal screen
  if (revealedCard) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in zoom-in duration-500">
        <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600 mb-8 drop-shadow-[0_0_15px_rgba(252,211,77,0.5)]">
          {t('reveal.title')}
        </h2>
        <div className="scale-125 mb-12 relative group">
          <div className="absolute inset-0 bg-yellow-400/20 blur-3xl rounded-full scale-150 animate-pulse"></div>
          <Card {...revealedCard} disableLink />
        </div>
        <button 
          onClick={() => { setRevealedCard(null); setSearchResult(null); setSearchQuery(''); }}
          className="px-8 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl font-bold transition-all shadow-lg hover:shadow-xl"
        >
          {t('reveal.back')}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-6">
      
      {/* Header & Wallet */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl inline-flex text-white shadow-lg shadow-orange-500/20">
            <Hammer size={24} weight="fill" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">{t('header.title')}</h1>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-1">
              <p className="text-slate-400 text-sm">{t('header.subtitle')}</p>
              <a href="/wiki#forge-system" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 font-medium bg-indigo-500/10 px-2 py-1 rounded-lg w-fit">
                <BookOpenText size={14} weight="bold" /> {t('header.wikiLink')}
              </a>
            </div>
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-slate-800">
          <h3 className="text-xs uppercase tracking-widest font-bold text-slate-500 mb-3">{t('header.wallet')}</h3>
          {renderWallet()}
          <WildcardExchange fragments={fragments} onDone={fetchWallet} />
        </div>
      </div>

      {/* Dev of the Week (weekly event) */}
      {featuredDev && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-fuchsia-500/40 bg-gradient-to-r from-fuchsia-950/40 to-slate-900 p-5 shadow-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {featuredDev.avatarUrl ? <img src={featuredDev.avatarUrl} alt="" className="h-14 w-14 rounded-full border-2 border-fuchsia-400/60" /> : <span className="h-14 w-14 rounded-full bg-slate-700" />}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">{t('featured.label', { percent: featuredDev.discountPercent })}</p>
            <p className="flex items-center gap-2 text-lg font-black text-white">
              <RarityGem rarity={featuredDev.rarity} size={14} title={featuredDev.rarity} />
              <span className="truncate">{featuredDev.name}</span>
              <span className="text-sm font-normal text-slate-400">@{featuredDev.githubUsername}</span>
            </p>
            <p className="text-xs text-slate-400">
              {t('featured.text', { percent: featuredDev.discountPercent, time: formatSeasonLeft(featuredDev.endsInMs) })}
            </p>
          </div>
          <button
            onClick={() => forgeDev(featuredDev.githubUsername)}
            className="shrink-0 rounded-xl bg-fuchsia-600 px-5 py-2.5 font-bold text-white transition-colors hover:bg-fuchsia-500"
          >
            {t('featured.cta')}
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex gap-1 sm:gap-2 p-1 bg-slate-900/50 rounded-xl border border-slate-800/50 w-fit max-w-full overflow-x-auto">
        <button 
          onClick={() => setActiveTab('INVOKE')}
          className={`flex items-center gap-2 px-3 sm:px-6 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'INVOKE' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <Sparkle size={18} /> {t('tabs.invoke')}
        </button>
        <button 
          onClick={() => setActiveTab('WISHLIST')}
          className={`flex items-center gap-2 px-3 sm:px-6 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'WISHLIST' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <Star size={18} /> {t('tabs.wishlist')} <span className="text-xs bg-slate-800 px-1.5 py-0.5 rounded ml-1">{wishlist.length}/5</span>
        </button>
        <button 
          onClick={() => setActiveTab('HISTORY')}
          className={`flex items-center gap-2 px-3 sm:px-6 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'HISTORY' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <ClockCounterClockwise size={18} /> {t('tabs.history')}
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'INVOKE' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Search Column */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h2 className="font-bold text-lg mb-4">{t('search.title')}</h2>
              <form onSubmit={handleSearch} className="flex gap-2">
                <input
                  type="text"
                  placeholder={t('search.placeholder')}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button 
                  type="submit"
                  aria-label={t('search.button')}
                  disabled={isSearching}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white rounded-xl px-4 flex items-center justify-center transition-colors"
                >
                  <MagnifyingGlass size={20} weight="bold" />
                </button>
              </form>
            </div>

            {searchResult && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col items-center flex-1">
                <div className="w-full flex justify-between items-center mb-6">
                  <h3 className="font-bold text-slate-300">
                    {t('search.targetAcquired')}
                    {searchResult.featured && <span className="ml-2 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-xs font-bold text-fuchsia-300">{t('featured.badge')}</span>}
                  </h3>
                  <button 
                    onClick={() => toggleWishlist(searchResult.stats.githubUsername)}
                    className="text-slate-400 hover:text-yellow-400 transition-colors"
                    title={t('search.toggleWishlist')}
                  >
                    <Star size={24} weight={wishlist.some(w => w.username.toLowerCase() === searchResult.stats.githubUsername.toLowerCase()) ? "fill" : "regular"} className={wishlist.some(w => w.username.toLowerCase() === searchResult.stats.githubUsername.toLowerCase()) ? "text-yellow-400" : ""} />
                  </button>
                </div>
                <div className="scale-[0.85] origin-top">
                  <Card {...searchResult.stats} disableLink />
                </div>
              </div>
            )}
          </div>

          {/* Requirements Column */}
          <div className="lg:col-span-7">
            {searchResult ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col h-full gap-6">
                
                <div className="border border-slate-800 bg-slate-950/50 rounded-xl p-5">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <Sparkle className="text-orange-400" /> {t('requirements.title')}
                  </h3>
                  
                  {/* Fragments Row */}
                  <div className="flex justify-between items-center mb-4 p-4 bg-slate-900 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${LANG_COLORS[lang]?.split(' ')[0] || 'bg-slate-500'}`}></div>
                      <div>
                        <div className="font-bold">{onlyWildcards ? t('requirements.wildcardFragments') : t('requirements.langFragments', { lang })}</div>
                        <div className="text-xs text-slate-400">
                          {t('requirements.required', { amount: reqFragments })}
                          {searchResult.featured && searchResult.fullCost && <span className="ml-1 text-fuchsia-300">{t.rich('featured.fullCost', { amount: searchResult.fullCost.fragments, s: chunks => <s>{chunks}</s> })}</span>}
                          {onlyWildcards ? ` · ${t('requirements.noLanguage')}` : ownedWildcards > 0 ? ` · ${t('requirements.wildcardsCover', { lang })}` : ''}
                        </div>
                        {payment && payment.fromWildcard > 0 && (
                          <div className="text-xs text-amber-300">{payment.fromLanguage > 0 ? t('requirements.usesMixed', { count: payment.fromLanguage, lang, wildcards: payment.fromWildcard }) : t('requirements.usesWildcards', { wildcards: payment.fromWildcard })}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-black text-lg ${hasFragments ? 'text-green-400' : 'text-red-400'}`}>
                        {usableFragments} / {reqFragments}
                      </div>
                      {!hasFragments && (
                        <div className="text-xs text-red-400/70 uppercase font-bold tracking-wider">{t('requirements.deficit', { amount: reqFragments - usableFragments })}</div>
                      )}
                    </div>
                  </div>

                  {/* BITS Row */}
                  <div className="flex justify-between items-center mb-6 p-4 bg-slate-900 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-3">
                      <Coin size={24} weight="fill" className="text-yellow-500" />
                      <div>
                        <div className="font-bold">BITS</div>
                        <div className="text-xs text-slate-400">
                          {t('requirements.required', { amount: reqBits })}
                          {searchResult.featured && searchResult.fullCost && <span className="ml-1 text-fuchsia-300">{t.rich('featured.fullCost', { amount: searchResult.fullCost.bits, s: chunks => <s>{chunks}</s> })}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-black text-lg ${hasBits ? 'text-green-400' : 'text-red-400'}`}>
                        {currency} / {reqBits}
                      </div>
                      {!hasBits && (
                        <div className="text-xs text-red-400/70 uppercase font-bold tracking-wider">{t('requirements.deficit', { amount: reqBits - currency })}</div>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden mb-6">
                    <div 
                      className="h-full bg-gradient-to-r from-orange-600 to-yellow-400 transition-all duration-1000"
                      style={{ width: `${Math.min(100, (usableFragments / reqFragments) * 100)}%` }}
                    />
                  </div>

                  {/* Action */}
                  <button
                    onClick={handleInvoke}
                    disabled={!canInvoke || isInvoking}
                    className={`w-full py-4 rounded-xl font-black text-lg uppercase tracking-widest transition-all ${canInvoke ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:shadow-[0_0_30px_rgba(249,115,22,0.6)] hover:scale-[1.02]' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                  >
                    {isInvoking ? t('requirements.invoking') : canInvoke ? t('requirements.invoke') : t('requirements.missing')}
                  </button>
                </div>

                {/* Recommendations */}
                {searchResult.recommendedPacks && searchResult.recommendedPacks.length > 0 && (
                  <div className="border border-indigo-500/20 bg-indigo-950/10 rounded-xl p-5 flex-1">
                    <h4 className="text-sm font-bold text-indigo-300 mb-3 flex items-center gap-2">
                       {t('recommendation.title', { lang })}
                    </h4>
                    <p className="text-xs text-slate-400 mb-4 tracking-wide leading-relaxed">
                      {t('recommendation.text', { lang })}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {searchResult.recommendedPacks.map((pack: any) => (
                        <Link href={`/store#pack-${pack.id}`} key={pack.id} className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-800 rounded-lg hover:border-indigo-500/50 transition-colors group cursor-pointer block">
                          <div className="w-10 h-10 rounded shadow-md" style={{ background: pack.visualTheme?.gradient }}></div>
                          <div>
                            <div className="font-bold text-sm text-slate-200 group-hover:text-indigo-300 transition-colors line-clamp-1">{pack.name}</div>
                            <div className="text-xs text-slate-500">{pack.cost} BITS</div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl h-full flex flex-col items-center justify-center text-center opacity-70">
                <MagnifyingGlass size={48} className="text-slate-700 mb-4" />
                <h3 className="text-xl font-bold text-slate-500 mb-2">{t('search.awaitingTitle')}</h3>
                <p className="text-slate-500 text-sm max-w-sm">
                  {t('search.awaitingText')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WISHLIST TAB */}
      {activeTab === 'WISHLIST' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <h2 className="font-bold text-xl mb-6">{t('wishlist.title')}</h2>
          {wishlist.length === 0 ? (
            <div className="text-center py-12 border border-slate-800 border-dashed rounded-xl">
              <Star size={48} className="mx-auto text-slate-700 mb-4" />
              <div className="text-slate-400">{t('wishlist.empty')}</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {wishlist.map(w => {
                const owned = fragments[w.primaryLanguage] || 0;
                const percentage = Math.min(100, Math.max(0, (owned / w.fragmentsRequired) * 100));
                return (
                  <div key={w.username} className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex flex-col relative group">
                    <button onClick={() => toggleWishlist(w.username)} className="absolute top-4 right-4 text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 z-10">
                      {t('wishlist.remove')}
                    </button>
                    <div className="flex items-center gap-4 mb-4">
                      <img src={w.avatarUrl} alt={w.username} className="w-12 h-12 rounded-full border border-slate-700" />
                      <div>
                        <div className="font-bold">{w.name}</div>
                        <div className="text-xs text-slate-400">@{w.username} • {w.rarity}</div>
                      </div>
                    </div>
                    
                    <div className="text-xs flex justify-between tracking-wider font-bold text-slate-500 mb-2">
                      <span>{w.primaryLanguage}</span>
                      <span className={owned >= w.fragmentsRequired ? 'text-green-400' : ''}>{owned} / {w.fragmentsRequired}</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-600 to-indigo-400 transition-all" style={{ width: `${percentage}%` }}></div>
                    </div>
                    
                    <button 
                      onClick={() => {
                        setSearchQuery(w.username);
                        handleSearch({ preventDefault: () => {} } as React.FormEvent);
                        setActiveTab('INVOKE');
                      }}
                      className="mt-4 w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-bold transition-colors"
                    >
                      {t('wishlist.view')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === 'HISTORY' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <h2 className="font-bold text-xl mb-6">{t('history.title')}</h2>
          {logs.length === 0 ? (
            <div className="text-center py-12 border border-slate-800 border-dashed rounded-xl">
              <ClockCounterClockwise size={48} className="mx-auto text-slate-700 mb-4" />
              <div className="text-slate-400">{t('history.empty')}</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                    <th className="p-4 font-bold">{t('history.date')}</th>
                    <th className="p-4 font-bold">{t('history.source')}</th>
                    <th className="p-4 font-bold">{t('history.language')}</th>
                    <th className="p-4 font-bold text-right">{t('history.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                      <td className="p-4 text-sm text-slate-400">{new Date(log.date).toLocaleString(locale)}</td>
                      <td className="p-4 text-sm font-medium">{log.source}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-xs border ${LANG_COLORS[log.language] || LANG_COLORS.Unknown}`}>
                          {log.language === WILDCARD ? t('wildcard') : log.language}
                        </span>
                      </td>
                      <td className={`p-4 text-right font-black ${log.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {log.amount > 0 ? '+' : ''}{log.amount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

/** Trade WILDCARD_EXCHANGE_RATE fragments of a language for one wildcard (pays any language). */
function WildcardExchange({ fragments, onDone }: { fragments: Record<string, number>; onDone: () => void }) {
  const languages = Object.keys(fragments).filter(l => maxWildcardsFrom(fragments, l) > 0);
  const [language, setLanguage] = useState('');
  const [amount, setAmount] = useState(1);
  const [busy, setBusy] = useState(false);
  const t = useTranslations('forge.exchange');
  const selected = languages.includes(language) ? language : languages[0] ?? '';
  const max = selected ? maxWildcardsFrom(fragments, selected) : 0;
  const wildcards = Math.min(Math.max(1, amount), Math.max(1, max));

  if (languages.length === 0) return null;

  const exchange = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/forge/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: selected, wildcards }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('failed'));
      toast.success(t('success', { count: wildcards }));
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm">
      <span className="font-bold text-amber-200">{t('title')}</span>
      <span className="text-xs text-slate-400">{t('text', { rate: WILDCARD_EXCHANGE_RATE })}</span>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <select value={selected} onChange={e => setLanguage(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-white" aria-label={t('languageLabel')}>
          {languages.map(l => <option key={l} value={l}>{l} ({fragments[l]})</option>)}
        </select>
        <input
          type="number" min={1} max={max} value={wildcards}
          onChange={e => setAmount(Number(e.target.value))}
          className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-white" aria-label={t('amountLabel')}
        />
        <button onClick={exchange} disabled={busy} className="rounded-lg bg-amber-500/20 px-3 py-1.5 font-bold text-amber-100 hover:bg-amber-500/30 disabled:opacity-50">
          {busy ? '…' : t('trade', { cost: wildcards * WILDCARD_EXCHANGE_RATE, wildcards })}
        </button>
      </div>
    </div>
  );
}
