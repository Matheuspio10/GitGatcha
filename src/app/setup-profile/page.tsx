'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { User, Warning } from '@phosphor-icons/react';

export default function SetupProfilePage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  // Double check if they suddenly have a username
  if (session?.user && session.user.username) {
    router.push('/dashboard'); // or anywhere else
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/user/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: username.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update username.');
      }

      // Update the client session token completely so the middleware sees it
      await update({ username: data.username });

      // Take them to the dashboard
      router.push('/dashboard');
      
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black px-4 relative z-50">
      
      {/* Background decoration */}
      <div className="absolute top-1/4 -right-20 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl opacity-50 mix-blend-screen pointer-events-none"></div>
      <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl opacity-50 mix-blend-screen pointer-events-none"></div>

      <div className="max-w-md w-full bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
             <User size={32} weight="fill" className="text-white" />
          </div>
        </div>

        <h1 className="text-3xl font-black text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 mb-2">
          Choose Your Nickname
        </h1>
        <p className="text-slate-400 text-center mb-8">
          Welcome to GitGacha! To start collecting cards and battling, you must secure a unique nickname.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div>
            <label className="block text-slate-300 font-bold mb-2 text-sm" htmlFor="username">
              Nickname
            </label>
            <input
              id="username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 font-medium text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
              placeholder="e.g. CodeMaster99"
              autoComplete="off"
            />
            <p className="text-xs text-slate-500 mt-2">
              Only letters, numbers, and underscores. (3-20 characters)
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-950/50 border border-red-500/30 text-red-400 p-4 rounded-xl text-sm">
              <Warning size={20} weight="fill" className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || username.length < 3}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Saving...
              </div>
            ) : (
              'Claim Nickname'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
