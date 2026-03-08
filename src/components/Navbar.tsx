'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useState } from 'react';
import { Coin, X } from '@phosphor-icons/react';

export function Navbar({ username, currency }: { username: string, currency: number }) {
  const [showBitsModal, setShowBitsModal] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-50 w-full backdrop-blur supports-[backdrop-filter]:bg-slate-900/60 border-b border-slate-800">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between relative">
        <Link href="/" className="font-bold text-2xl tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
          GitGatcha
        </Link>

        {username && (
          <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-8 text-lg font-bold text-slate-400">
            <Link href="/store" className={`transition-all ${pathname === '/store' ? 'text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] scale-110' : 'hover:text-white hover:scale-105'}`}>Gacha</Link>
            <Link href="/collection" className={`transition-all ${pathname === '/collection' ? 'text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] scale-110' : 'hover:text-white hover:scale-105'}`}>Collection</Link>
            <Link href="/battle" className={`transition-all ${pathname === '/battle' ? 'text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] scale-110' : 'hover:text-white hover:scale-105'}`}>Battle</Link>
            <Link href="/leaderboard" className={`transition-all ${pathname === '/leaderboard' ? 'text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] scale-110' : 'hover:text-white hover:scale-105'}`}>Rankings</Link>
          </nav>
        )}

        {username ? (
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowBitsModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 transition-colors"
            >
              <Coin size={16} weight="fill" />
              <span className="font-bold text-sm">{currency}</span>
              <span className="text-xs uppercase tracking-wider hidden sm:inline">Bits</span>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold">
                {username.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-white line-clamp-1 max-w-[100px]">{username}</span>
            </div>
            <button 
              onClick={() => signOut({ callbackUrl: '/' })}
              className="text-xs text-slate-400 hover:text-white transition-colors ml-2"
            >
              Logout
            </button>
          </div>
        ) : (
          <div>
            <Link href="/login" className="text-sm font-bold text-indigo-400 hover:text-indigo-300 transition-colors">Login / Register</Link>
          </div>
        )}
      </div>
    </header>

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
