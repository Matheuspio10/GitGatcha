'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { Coin, X, List } from '@phosphor-icons/react';
import { NotificationBell } from './NotificationBell';
import { ChangelogFeature } from './ChangelogFeature';

export function Navbar({ username, currency: initialCurrency }: { username: string, currency: number }) {
  const [showBitsModal, setShowBitsModal] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currency, setCurrency] = useState(initialCurrency);
  const pathname = usePathname();

  // Live BITS sync: poll every 10s when tab is visible
  useEffect(() => {
    if (!username) return;

    let interval: NodeJS.Timeout | null = null;

    const fetchCurrency = async () => {
      try {
        const res = await fetch('/api/user/currency');
        if (res.ok) {
          const data = await res.json();
          setCurrency(data.currency);
        }
      } catch {
        // silent
      }
    };

    const startPolling = () => {
      fetchCurrency(); // fetch immediately on visibility
      interval = setInterval(fetchCurrency, 10000);
    };

    const stopPolling = () => {
      if (interval) clearInterval(interval);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        startPolling();
      } else {
        stopPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [username]);

  return (
    <>
      <header className="sticky top-0 z-50 w-full backdrop-blur supports-[backdrop-filter]:bg-slate-900/60 border-b border-slate-800">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between relative">
        <Link href="/" className="font-bold text-2xl tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
          GitGacha
        </Link>

        {username && (
          <nav className="hidden lg:flex flex-1 justify-center items-center gap-4 xl:gap-6 text-sm xl:text-base font-bold text-slate-400 mx-4">
            <Link href="/store" className={`transition-all ${pathname === '/store' ? 'text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] scale-110' : 'hover:text-white hover:scale-105'}`}>Gacha</Link>
            <Link href="/inventory" className={`transition-all ${pathname === '/inventory' ? 'text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] scale-110' : 'hover:text-white hover:scale-105'}`}>Inventory</Link>
            <Link href="/collection" className={`transition-all ${pathname === '/collection' ? 'text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] scale-110' : 'hover:text-white hover:scale-105'}`}>Collection</Link>
            <Link href="/forge" className={`transition-all ${pathname === '/forge' ? 'text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] scale-110' : 'hover:text-white hover:scale-105'}`}>Forge</Link>
            <Link href="/battle" className={`transition-all ${pathname === '/battle' ? 'text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] scale-110' : 'hover:text-white hover:scale-105'}`}>Battle</Link>
            <Link href="/leaderboard" className={`transition-all ${pathname === '/leaderboard' ? 'text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] scale-110' : 'hover:text-white hover:scale-105'}`}>Rankings</Link>
            <Link href="/wiki" className={`transition-all ${pathname === '/wiki' ? 'text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] scale-110' : 'hover:text-white hover:scale-105'}`}>Wiki</Link>
          </nav>
        )}

        {username ? (
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowBitsModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 transition-colors"
            >
              <Coin size={16} weight="fill" />
              <span className="font-bold text-sm">{currency}</span>
              <span className="text-xs uppercase tracking-wider hidden sm:inline">Bits</span>
            </button>
            <ChangelogFeature username={username} />
            <NotificationBell />
            
            {/* Desktop Profile */}
            <div className="hidden lg:flex items-center gap-2">
              <Link href={`/profile/${username}`} className="flex items-center gap-2 hover:bg-slate-800/50 p-1.5 pr-3 rounded-full transition-colors cursor-pointer group">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold group-hover:shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all">
                  {username.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors line-clamp-1 max-w-[100px]">{username}</span>
              </Link>
              <button 
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-xs text-slate-400 hover:text-white transition-colors ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                Logout
              </button>
            </div>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2"
              aria-label="Open global menu"
            >
              <List size={24} weight="bold" />
            </button>
          </div>
        ) : (
          <div>
            <Link href="/login" className="text-sm font-bold text-indigo-400 hover:text-indigo-300 transition-colors">Login / Register</Link>
          </div>
        )}
      </div>
    </header>

      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div 
            className="fixed inset-y-0 right-0 w-64 bg-slate-900 border-l border-slate-800 shadow-2xl p-6 flex flex-col transform transition-transform"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-8">
              <span className="font-bold text-lg text-white">Menu</span>
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-slate-400 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center -mr-3"
              >
                <X size={24} />
              </button>
            </div>

            {username && (
              <div className="mb-6 pb-6 border-b border-slate-800">
                <Link 
                  href={`/profile/${username}`} 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-800/50 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold group-hover:shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all">
                    {username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white line-clamp-1">{username}</div>
                    <div className="text-xs text-slate-400">View Profile</div>
                  </div>
                </Link>
              </div>
            )}

            <nav className="flex flex-col gap-2 flex-1">
              {[
                { name: 'Gacha', path: '/store' },
                { name: 'Inventory', path: '/inventory' },
                { name: 'Collection', path: '/collection' },
                { name: 'Forge', path: '/forge' },
                { name: 'Battle', path: '/battle' },
                { name: 'Rankings', path: '/leaderboard' },
                { name: 'Wiki', path: '/wiki' },
              ].map(link => (
                <Link
                  key={link.name}
                  href={link.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`p-3 rounded-lg flex items-center transition-all min-h-[44px] font-bold text-[15px] ${pathname === link.path ? 'bg-indigo-500/10 text-indigo-400' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
                >
                  {link.name}
                </Link>
              ))}
            </nav>

            <div className="mt-8 pt-6 border-t border-slate-800">
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="w-full p-3 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors flex items-center font-bold min-h-[44px] text-[15px]"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Buy Bits Modal (Visual Only) */}
      {showBitsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-2xl w-full shadow-2xl relative overflow-hidden">
            <button 
              onClick={() => setShowBitsModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors p-1"
            >
              <X size={24} />
            </button>

            <div className="text-center mb-8">
              <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600">
                Aquire Bits
              </h2>
              <p className="text-slate-400 mt-2">Power up your account with premium currency to summon legendary developers.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Package 1 */}
              <div className="bg-slate-800/50 border border-slate-700 hover:border-yellow-500/50 rounded-xl p-5 flex flex-col items-center text-center transition-all cursor-pointer group">
                <Coin size={48} weight="duotone" className="text-yellow-500 mb-3 group-hover:scale-110 transition-transform" />
                <div className="text-xl font-bold text-white mb-1">500 Bits</div>
                <div className="text-slate-400 text-sm mb-4">Starter Pack</div>
                <div className="mt-auto w-full py-2 bg-slate-700 group-hover:bg-yellow-600 rounded-lg text-white font-bold transition-colors">
                  $4.99
                </div>
              </div>

              {/* Package 2 */}
              <div className="bg-slate-800/50 border border-yellow-500/30 hover:border-yellow-400 rounded-xl p-5 flex flex-col items-center text-center transition-all cursor-pointer group relative overflow-hidden">
                <div className="absolute top-0 w-full bg-yellow-500 text-black text-[10px] font-black uppercase tracking-widest py-0.5">Most Popular</div>
                <div className="flex -space-x-3 mb-3 mt-3 group-hover:scale-110 transition-transform">
                  <Coin size={48} weight="fill" className="text-yellow-500 relative z-10" />
                  <Coin size={48} weight="fill" className="text-amber-600" />
                </div>
                <div className="text-xl font-bold text-white mb-1">1,200 Bits</div>
                <div className="text-yellow-400 text-sm mb-4">+20% Bonus</div>
                <div className="mt-auto w-full py-2 bg-yellow-600 group-hover:bg-yellow-500 rounded-lg text-white font-bold transition-colors shadow-[0_0_15px_rgba(202,138,4,0.3)]">
                  $9.99
                </div>
              </div>

              {/* Package 3 */}
              <div className="bg-slate-800/50 border border-slate-700 hover:border-purple-500/50 rounded-xl p-5 flex flex-col items-center text-center transition-all cursor-pointer group hover:shadow-[0_0_30px_rgba(168,85,247,0.2)]">
                <div className="flex -space-x-2 mb-3 group-hover:scale-110 transition-transform">
                  <Coin size={48} weight="fill" className="text-purple-400" />
                  <Coin size={48} weight="fill" className="text-yellow-500 relative z-10 -translate-y-2" />
                  <Coin size={48} weight="fill" className="text-indigo-400" />
                </div>
                <div className="text-xl font-bold text-white mb-1">5,000 Bits</div>
                <div className="text-purple-400 text-sm mb-4">Whale Tier</div>
                <div className="mt-auto w-full py-2 bg-slate-700 group-hover:bg-purple-600 rounded-lg text-white font-bold transition-colors">
                  $39.99
                </div>
              </div>
            </div>

            <p className="text-center text-xs text-slate-500 mt-6">
              Visual mockup only. Purchasing is currently disabled in this environment.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
