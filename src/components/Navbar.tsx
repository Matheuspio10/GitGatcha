'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { Coin, X, CalendarCheck, Target, Sword, TrendUp, ShoppingCart, Package, Backpack, Cards, DotsThreeOutline } from '@phosphor-icons/react';
import { NotificationBell } from './NotificationBell';
import { ChangelogFeature } from './ChangelogFeature';
import { UserAvatar } from './UserAvatar';
import { Logo, LogoMark } from './Logo';

/** Bottom tab bar on phones and tablets (the drawer behind "More" has every link). */
const TAB_BAR = [
  { name: 'Gacha', path: '/store', icon: Package },
  { name: 'Packs', path: '/inventory', icon: Backpack },
  { name: 'Cards', path: '/collection', icon: Cards },
  { name: 'Battle', path: '/battle', icon: Sword },
] as const;

export function Navbar({ username, currency: initialCurrency, userImage }: { username: string, currency: number, userImage?: string | null }) {
  const [showBitsModal, setShowBitsModal] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currency, setCurrency] = useState(initialCurrency);
  const pathname = usePathname();

  // Live BITS sync: refetch on the global 'bits:refresh' event (dispatched after
  // any action that changes BITS), on tab focus, and poll every 30s as a fallback.
  useEffect(() => {
    if (!username) return;

    let interval: NodeJS.Timeout | null = null;

    const fetchCurrency = async () => {
      try {
        const res = await fetch('/api/user/currency', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (typeof data.currency === 'number') setCurrency(data.currency);
        }
      } catch {
        // silent
      }
    };

    const startPolling = () => {
      if (interval) clearInterval(interval);
      fetchCurrency(); // fetch immediately on visibility
      interval = setInterval(fetchCurrency, 30000);
    };

    const stopPolling = () => {
      if (interval) clearInterval(interval);
      interval = null;
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
    window.addEventListener('bits:refresh', fetchCurrency);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('bits:refresh', fetchCurrency);
    };
  }, [username]);

  // Close the BITS panel with Escape
  useEffect(() => {
    if (!showBitsModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowBitsModal(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showBitsModal]);

  return (
    <>
      <header className="sticky top-0 z-50 w-full backdrop-blur supports-[backdrop-filter]:bg-ink-0/80 border-b border-white/[0.08]">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between relative">
        <Link href="/" aria-label="GitGacha home" className="flex items-center">
          <span className="hidden sm:inline-flex"><Logo size={20} /></span>
          <LogoMark size={32} className="sm:hidden" />
        </Link>

        {username && (
          <nav className="hidden lg:flex flex-1 justify-center items-center gap-4 xl:gap-6 text-sm xl:text-base font-bold text-slate-400 mx-4">
            <Link href="/store" className={`transition-all ${pathname === '/store' ? 'text-transparent bg-clip-text bg-gradient-to-r from-brand-a to-brand-b drop-shadow-[0_0_8px_rgba(255,79,163,0.5)] scale-110' : 'hover:text-white hover:scale-105'}`}>Gacha</Link>
            <Link href="/inventory" className={`transition-all ${pathname === '/inventory' ? 'text-transparent bg-clip-text bg-gradient-to-r from-brand-a to-brand-b drop-shadow-[0_0_8px_rgba(255,79,163,0.5)] scale-110' : 'hover:text-white hover:scale-105'}`}>Inventory</Link>
            <Link href="/collection" className={`transition-all ${pathname === '/collection' ? 'text-transparent bg-clip-text bg-gradient-to-r from-brand-a to-brand-b drop-shadow-[0_0_8px_rgba(255,79,163,0.5)] scale-110' : 'hover:text-white hover:scale-105'}`}>Collection</Link>
            <Link href="/forge" className={`transition-all ${pathname === '/forge' ? 'text-transparent bg-clip-text bg-gradient-to-r from-brand-a to-brand-b drop-shadow-[0_0_8px_rgba(255,79,163,0.5)] scale-110' : 'hover:text-white hover:scale-105'}`}>Forge</Link>
            <Link href="/battle" className={`transition-all ${pathname === '/battle' ? 'text-transparent bg-clip-text bg-gradient-to-r from-brand-a to-brand-b drop-shadow-[0_0_8px_rgba(255,79,163,0.5)] scale-110' : 'hover:text-white hover:scale-105'}`}>Battle</Link>
            <Link href="/leaderboard" className={`transition-all ${pathname === '/leaderboard' ? 'text-transparent bg-clip-text bg-gradient-to-r from-brand-a to-brand-b drop-shadow-[0_0_8px_rgba(255,79,163,0.5)] scale-110' : 'hover:text-white hover:scale-105'}`}>Rankings</Link>
            <Link href="/friends" className={`transition-all ${pathname === '/friends' ? 'text-transparent bg-clip-text bg-gradient-to-r from-brand-a to-brand-b drop-shadow-[0_0_8px_rgba(255,79,163,0.5)] scale-110' : 'hover:text-white hover:scale-105'}`}>Friends</Link>
            <Link href="/wiki" className={`transition-all ${pathname === '/wiki' ? 'text-transparent bg-clip-text bg-gradient-to-r from-brand-a to-brand-b drop-shadow-[0_0_8px_rgba(255,79,163,0.5)] scale-110' : 'hover:text-white hover:scale-105'}`}>Wiki</Link>
          </nav>
        )}

        {username ? (
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowBitsModal(true)}
              aria-label={`${currency} BITS: how to earn more`}
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
                <UserAvatar username={username} image={userImage} size="sm" />
                <span className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors line-clamp-1 max-w-[100px]">{username}</span>
              </Link>
              <button 
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-xs text-slate-400 hover:text-white transition-colors ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                Logout
              </button>
            </div>

            {/* Phones and tablets: the menu opens from "More" in the bottom tab bar */}
          </div>
        ) : (
          <div>
            <Link href="/login" className="text-sm font-bold text-indigo-400 hover:text-indigo-300 transition-colors">Login / Register</Link>
          </div>
        )}
      </div>
    </header>

      {/* Phone tab bar: the four most used screens, everything else under "More" */}
      {username && (
        <nav
          aria-label="Main"
          className="lg:hidden fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.08] bg-ink-0/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
        >
          <ul className="grid h-16 grid-cols-5">
            {TAB_BAR.map(tab => {
              const active = pathname === tab.path || pathname.startsWith(`${tab.path}/`);
              return (
                <li key={tab.path}>
                  <Link
                    href={tab.path}
                    aria-current={active ? 'page' : undefined}
                    className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors ${active ? 'text-brand-b' : 'text-slate-400 hover:text-white'}`}
                  >
                    <tab.icon size={22} weight={active ? 'fill' : 'regular'} />
                    {tab.name}
                  </Link>
                </li>
              );
            })}
            <li>
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                aria-label="More: open the menu"
                aria-expanded={isMobileMenuOpen}
                className={`flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors ${isMobileMenuOpen ? 'text-brand-b' : 'text-slate-400 hover:text-white'}`}
              >
                <DotsThreeOutline size={22} weight={isMobileMenuOpen ? 'fill' : 'regular'} />
                More
              </button>
            </li>
          </ul>
        </nav>
      )}

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
                  <UserAvatar username={username} image={userImage} size="md" />
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
                { name: 'Friends', path: '/friends' },
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

      {/* BITS panel: balance + how to earn (no real-money purchases) */}
      {showBitsModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setShowBitsModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bits-panel-title"
            className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl relative max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setShowBitsModal(false)}
              className="absolute top-3 right-3 text-slate-400 hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close"
            >
              <X size={24} />
            </button>

            <h2 id="bits-panel-title" className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600">
              Your BITS
            </h2>
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
              <Coin size={32} weight="fill" className="text-yellow-500 shrink-0" />
              <div>
                <div className="text-2xl font-black text-white leading-none">{currency.toLocaleString('en-US')}</div>
                <div className="text-xs uppercase tracking-wider text-yellow-500/80 mt-1">Current balance</div>
              </div>
              <Link
                href="/bits"
                onClick={() => setShowBitsModal(false)}
                className="ml-auto text-xs font-bold text-indigo-300 hover:text-indigo-200 whitespace-nowrap"
              >
                History &rarr;
              </Link>
            </div>

            <h3 className="mt-6 mb-3 text-sm font-bold uppercase tracking-wider text-slate-400">How to earn BITS</h3>
            <ul className="flex flex-col gap-2">
              <li>
                <Link
                  href="/store"
                  onClick={() => setShowBitsModal(false)}
                  className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-800/40 p-3 hover:border-yellow-500/40 hover:bg-slate-800 transition-colors group"
                >
                  <CalendarCheck size={22} weight="duotone" className="text-yellow-500 shrink-0 mt-0.5" />
                  <span className="flex-1">
                    <span className="block font-bold text-white text-sm">Daily reward</span>
                    <span className="block text-xs text-slate-400">Claim free BITS once a day in the Gacha shop.</span>
                  </span>
                  <span className="text-xs font-bold text-indigo-400 group-hover:text-indigo-300 whitespace-nowrap self-center">Go to Gacha &rarr;</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/store"
                  onClick={() => setShowBitsModal(false)}
                  className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-800/40 p-3 hover:border-yellow-500/40 hover:bg-slate-800 transition-colors group"
                >
                  <Target size={22} weight="duotone" className="text-yellow-500 shrink-0 mt-0.5" />
                  <span className="flex-1">
                    <span className="block font-bold text-white text-sm">Daily missions</span>
                    <span className="block text-xs text-slate-400">Finish missions for bonus BITS. They refresh every day.</span>
                  </span>
                  <span className="text-xs font-bold text-indigo-400 group-hover:text-indigo-300 whitespace-nowrap self-center">See missions &rarr;</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/battle"
                  onClick={() => setShowBitsModal(false)}
                  className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-800/40 p-3 hover:border-yellow-500/40 hover:bg-slate-800 transition-colors group"
                >
                  <Sword size={22} weight="duotone" className="text-yellow-500 shrink-0 mt-0.5" />
                  <span className="flex-1">
                    <span className="block font-bold text-white text-sm">Battles</span>
                    <span className="block text-xs text-slate-400">Win battles and league matches to earn BITS.</span>
                  </span>
                  <span className="text-xs font-bold text-indigo-400 group-hover:text-indigo-300 whitespace-nowrap self-center">Start a battle &rarr;</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/wiki"
                  onClick={() => setShowBitsModal(false)}
                  className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-800/40 p-3 hover:border-yellow-500/40 hover:bg-slate-800 transition-colors group"
                >
                  <TrendUp size={22} weight="duotone" className="text-yellow-500 shrink-0 mt-0.5" />
                  <span className="flex-1">
                    <span className="block font-bold text-white text-sm">Level-ups</span>
                    <span className="block text-xs text-slate-400">Leveling up grants rewards, including BITS and boosters.</span>
                  </span>
                  <span className="text-xs font-bold text-indigo-400 group-hover:text-indigo-300 whitespace-nowrap self-center">Read the wiki &rarr;</span>
                </Link>
              </li>
            </ul>

            <div className="mt-6 flex items-center gap-3 rounded-xl border border-dashed border-slate-700 p-3 text-slate-500" aria-disabled="true">
              <ShoppingCart size={20} className="shrink-0" />
              <div className="text-sm">
                <span className="font-bold">Buy BITS — coming soon.</span>{' '}
                <span className="text-xs">BITS can&apos;t be bought with real money yet.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
