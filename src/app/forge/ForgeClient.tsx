'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/Card';
import { useSession } from 'next-auth/react';
import { MagnifyingGlass, ClockCounterClockwise, Star, Sparkle, Hammer, Coin, BookOpenText } from '@phosphor-icons/react';
import { toast, Toaster } from 'react-hot-toast';

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

export default function ForgeClient() {
  const { data: session } = useSession();
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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResult(null);
    setRevealedCard(null);

    try {
      const res = await fetch(`/api/forge/search?username=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (res.ok) {
        setSearchResult(data);
      } else {
        toast.error(data.error || 'Developer not found');
      }
    } catch (e) {
      toast.error('Search failed');
    } finally {
      setIsSearching(false);
    }
  };

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
        toast.success(`Successfully invoked ${data.card.name}!`);
      } else {
        toast.error(data.error || 'Invocation failed');
      }
    } catch (e) {
      toast.error('Invocation failed');
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
        toast.success(isWished ? 'Removed from Wishlist' : 'Added to Wishlist');
      } else {
        toast.error(data.error || 'Wishlist update failed');
      }
    } catch (e) {
      toast.error('Wishlist update failed');
    }
  };

  // Derived state for invoke button
  const reqFragments = searchResult?.cost?.fragments || 0;
  const reqBits = searchResult?.cost?.bits || 0;
  const lang = searchResult?.stats?.primaryLanguage || 'Unknown';
  const ownedFragments = fragments[lang] || 0;
  
  const hasFragments = ownedFragments >= reqFragments;
  const hasBits = currency >= reqBits;
  const canInvoke = hasFragments && hasBits;

  // Wallet Badges
  const renderWallet = () => {
    const activeFragments = Object.entries(fragments).filter(([_, count]) => count > 0);
    
    if (activeFragments.length === 0) return <div className="text-slate-500 text-sm">No fragments yet. Open packs to find some!</div>;

    return (
      <div className="flex flex-wrap gap-2">
        {activeFragments.map(([l, count]) => {
          const colorClass = LANG_COLORS[l] || LANG_COLORS.Unknown;
          return (
            <div key={l} className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-2 ${colorClass} shadow-md`}>
              <span>{l}</span>
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
        <Toaster position="top-center" />
        <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600 mb-8 drop-shadow-[0_0_15px_rgba(252,211,77,0.5)]">
          Invocation Successful!
        </h2>
        <div className="scale-125 mb-12 relative group">
          <div className="absolute inset-0 bg-yellow-400/20 blur-3xl rounded-full scale-150 animate-pulse"></div>
          <Card {...revealedCard} disableLink />
        </div>
        <button 
          onClick={() => { setRevealedCard(null); setSearchResult(null); setSearchQuery(''); }}
          className="px-8 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl font-bold transition-all shadow-lg hover:shadow-xl"
        >
          Return to Forge
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-6">
      <Toaster position="top-center" />
      
      {/* Header & Wallet */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl inline-flex text-white shadow-lg shadow-orange-500/20">
            <Hammer size={24} weight="fill" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">The Forge</h1>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-1">
              <p className="text-slate-400 text-sm">Combine Language Fragments with BITS to invoke specific developers.</p>
              <a href="/wiki#forge-system" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 font-medium bg-indigo-500/10 px-2 py-1 rounded-lg w-fit">
                <BookOpenText size={14} weight="bold" /> Learn more in the Wiki
              </a>
            </div>
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-slate-800">
          <h3 className="text-xs uppercase tracking-widest font-bold text-slate-500 mb-3">Your Fragment Wallet</h3>
          {renderWallet()}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 p-1 bg-slate-900/50 rounded-xl border border-slate-800/50 w-fit">
        <button 
          onClick={() => setActiveTab('INVOKE')}
          className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'INVOKE' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <Sparkle size={18} /> Invoke
        </button>
        <button 
          onClick={() => setActiveTab('WISHLIST')}
          className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'WISHLIST' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <Star size={18} /> Wishlist <span className="text-xs bg-slate-800 px-1.5 py-0.5 rounded ml-1">{wishlist.length}/5</span>
        </button>
        <button 
          onClick={() => setActiveTab('HISTORY')}
          className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'HISTORY' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <ClockCounterClockwise size={18} /> History
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'INVOKE' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Search Column */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h2 className="font-bold text-lg mb-4">Search Developer</h2>
              <form onSubmit={handleSearch} className="flex gap-2">
                <input
                  type="text"
                  placeholder="GitHub username..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button 
                  type="submit"
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
                  <h3 className="font-bold text-slate-300">Target Acquired</h3>
                  <button 
                    onClick={() => toggleWishlist(searchResult.stats.githubUsername)}
                    className="text-slate-400 hover:text-yellow-400 transition-colors"
                    title="Toggle Wishlist"
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
                    <Sparkle className="text-orange-400" /> Invocation Requirements
                  </h3>
                  
                  {/* Fragments Row */}
                  <div className="flex justify-between items-center mb-4 p-4 bg-slate-900 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${LANG_COLORS[lang]?.split(' ')[0] || 'bg-slate-500'}`}></div>
                      <div>
                        <div className="font-bold">{lang} Fragments</div>
                        <div className="text-xs text-slate-400">Required: {reqFragments}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-black text-lg ${hasFragments ? 'text-green-400' : 'text-red-400'}`}>
                        {ownedFragments} / {reqFragments}
                      </div>
                      {!hasFragments && (
                        <div className="text-xs text-red-400/70 uppercase font-bold tracking-wider">Deficit: {reqFragments - ownedFragments}</div>
                      )}
                    </div>
                  </div>

                  {/* BITS Row */}
                  <div className="flex justify-between items-center mb-6 p-4 bg-slate-900 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-3">
                      <Coin size={24} weight="fill" className="text-yellow-500" />
                      <div>
                        <div className="font-bold">BITS</div>
                        <div className="text-xs text-slate-400">Required: {reqBits}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-black text-lg ${hasBits ? 'text-green-400' : 'text-red-400'}`}>
                        {currency} / {reqBits}
                      </div>
                      {!hasBits && (
                        <div className="text-xs text-red-400/70 uppercase font-bold tracking-wider">Deficit: {reqBits - currency}</div>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden mb-6">
                    <div 
                      className="h-full bg-gradient-to-r from-orange-600 to-yellow-400 transition-all duration-1000"
                      style={{ width: `${Math.min(100, (ownedFragments / reqFragments) * 100)}%` }}
                    />
                  </div>

                  {/* Action */}
                  <button
                    onClick={handleInvoke}
                    disabled={!canInvoke || isInvoking}
                    className={`w-full py-4 rounded-xl font-black text-lg uppercase tracking-widest transition-all ${canInvoke ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:shadow-[0_0_30px_rgba(249,115,22,0.6)] hover:scale-[1.02]' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                  >
                    {isInvoking ? 'Invoking...' : canInvoke ? 'Invoke Developer' : 'Missing Requirements'}
                  </button>
                </div>

                {/* Recommendations */}
                {searchResult.recommendedPacks && searchResult.recommendedPacks.length > 0 && (
                  <div className="border border-indigo-500/20 bg-indigo-950/10 rounded-xl p-5 flex-1">
                    <h4 className="text-sm font-bold text-indigo-300 mb-3 flex items-center gap-2">
                       Recommendation: Farm {lang} Fragments
                    </h4>
                    <p className="text-xs text-slate-400 mb-4 tracking-wide leading-relaxed">
                      Open these packs to earn {lang} fragments from direct drops and duplicate conversions:
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {searchResult.recommendedPacks.map((pack: any) => (
                        <a href={`/store?pack=${pack.id}`} key={pack.id} className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-800 rounded-lg hover:border-indigo-500/50 transition-colors group cursor-pointer block">
                          <div className="w-10 h-10 rounded shadow-md" style={{ background: pack.visualTheme?.gradient }}></div>
                          <div>
                            <div className="font-bold text-sm text-slate-200 group-hover:text-indigo-300 transition-colors line-clamp-1">{pack.name}</div>
                            <div className="text-xs text-slate-500">{pack.cost} BITS</div>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl h-full flex flex-col items-center justify-center text-center opacity-70">
                <MagnifyingGlass size={48} className="text-slate-700 mb-4" />
                <h3 className="text-xl font-bold text-slate-600 mb-2">Awaiting Target</h3>
                <p className="text-slate-500 text-sm max-w-sm">
                  Search for a developer by GitHub username to see their invocation requirements and stats card.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WISHLIST TAB */}
      {activeTab === 'WISHLIST' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <h2 className="font-bold text-xl mb-6">Your Wishlist</h2>
          {wishlist.length === 0 ? (
            <div className="text-center py-12 border border-slate-800 border-dashed rounded-xl">
              <Star size={48} className="mx-auto text-slate-700 mb-4" />
              <div className="text-slate-400">Your wishlist is empty. Search for developers and click the star icon to track them here!</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {wishlist.map(w => {
                const owned = fragments[w.primaryLanguage] || 0;
                const percentage = Math.min(100, Math.max(0, (owned / w.fragmentsRequired) * 100));
                return (
                  <div key={w.username} className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex flex-col relative group">
                    <button onClick={() => toggleWishlist(w.username)} className="absolute top-4 right-4 text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 z-10">
                      Remove
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
                      View in Forge
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
          <h2 className="font-bold text-xl mb-6">Fragment History</h2>
          {logs.length === 0 ? (
            <div className="text-center py-12 border border-slate-800 border-dashed rounded-xl">
              <ClockCounterClockwise size={48} className="mx-auto text-slate-700 mb-4" />
              <div className="text-slate-400">No fragment activity yet.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                    <th className="p-4 font-bold">Date</th>
                    <th className="p-4 font-bold">Log Source</th>
                    <th className="p-4 font-bold">Language</th>
                    <th className="p-4 font-bold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                      <td className="p-4 text-sm text-slate-400">{new Date(log.date).toLocaleString()}</td>
                      <td className="p-4 text-sm font-medium">{log.source}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-xs border ${LANG_COLORS[log.language] || LANG_COLORS.Unknown}`}>
                          {log.language}
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
