'use client';

import { signIn } from 'next-auth/react';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { GithubLogo, Envelope } from '@phosphor-icons/react';

function LoginContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(searchParams?.get('register') === 'true');
  const [loading, setLoading] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isRegistering) {
      // Need a registration endpoint
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        if (res.ok) {
          await signIn('credentials', { email, password, callbackUrl: '/store' });
        } else {
          const data = await res.json();
          alert(data.error || 'Registration failed');
        }
      } catch (e) {
        alert('An error occurred');
      }
    } else {
      await signIn('credentials', { email, password, callbackUrl: '/store' });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl">
        <h2 className="text-3xl font-black mb-8 text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
          Access the Repository
        </h2>

        <div className="space-y-4 mb-8">
          <button
            type="button"
            onClick={() => signIn('github', { callbackUrl: '/store' })}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#24292e] hover:bg-[#2f363d] text-white rounded-xl font-bold transition-colors"
          >
            <GithubLogo size={20} weight="fill" />
            Continue with GitHub
          </button>
          
          <button
            type="button"
            onClick={() => signIn('google', { callbackUrl: '/store' })}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-slate-100 text-slate-900 rounded-xl font-bold transition-colors"
          >
            {/* Google Icon SVG */}
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        </div>

        <div className="relative flex items-center gap-4 py-4 mb-4">
          <div className="flex-1 h-px bg-white/10"></div>
          <span className="text-slate-500 text-sm font-medium uppercase tracking-wider">Or</span>
          <div className="flex-1 h-px bg-white/10"></div>
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            required
            minLength={6}
          />
          
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold tracking-wide hover:from-indigo-400 hover:to-purple-500 transition-all disabled:opacity-50"
          >
            {loading ? 'Processing...' : (isRegistering ? 'Sign Up' : 'Sign In')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          {isRegistering ? 'Already have an account? ' : 'New to GitGacha? '}
          <button 
            type="button" 
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-indigo-400 hover:text-indigo-300 font-bold underline"
          >
            {isRegistering ? 'Sign In' : 'Create Account'}
          </button>
        </p>

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[80vh] flex items-center justify-center"><div className="animate-spin h-8 w-8 border-b-2 border-indigo-500 rounded-full"></div></div>}>
      <LoginContent />
    </Suspense>
  );
}
