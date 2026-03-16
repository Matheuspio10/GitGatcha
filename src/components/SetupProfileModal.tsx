'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { User, Warning } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';

export function SetupProfileModal() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  
  // Wait until we are sure they are authenticated, and only show if they explicitely haven't setup their profile.
  const isTargeted = status === 'authenticated' && session?.user && session.user.hasSetupProfile === false;
  
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Pre-fill the input with their generated username if they have one but just haven't confirmed it
  useEffect(() => {
    if (isTargeted && session?.user?.username && !username) {
      setUsername(session.user.username);
    }
  }, [isTargeted, session?.user?.username]);

  if (!isTargeted) {
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

      // Update the client session token completely
      await update({ username: data.username, hasSetupProfile: true });

      // Take them to the dashboard
      router.push('/store');
      router.refresh(); // Refresh layout specifically to let the navbar notice changes
      
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      >
        <motion.div 
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-3xl p-8 shadow-2xl relative overflow-hidden"
        >
          {/* Background decoration */}
          <div className="absolute top-0 -right-20 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl mix-blend-screen pointer-events-none"></div>
          
          <div className="flex justify-center mb-6 relative z-10">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
               <User size={32} weight="fill" className="text-white" />
            </div>
          </div>

          <h2 className="text-2xl font-black text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 mb-2 relative z-10">
            Confirm Your Nickname
          </h2>
          <p className="text-slate-400 text-center mb-8 text-sm relative z-10">
            Welcome! To ensure a fair ranking and friend system, all accounts must actively reserve a unique unchangeable nickname. 
          </p>

          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            
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
              <div className="flex items-start gap-2 bg-red-950/50 border border-red-500/30 text-red-400 p-4 rounded-xl text-sm animate-pulse-fast">
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
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
