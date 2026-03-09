'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import Link from 'next/link';
import { Users, UserPlus, Check, X, Shield, Sword } from '@phosphor-icons/react';

export default function FriendsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  
  const [friends, setFriends] = useState<any[]>([]);
  const [incoming, setIncoming] = useState<any[]>([]);
  const [outgoing, setOutgoing] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (session) {
      fetchData();
    }
  }, [session]);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/friends');
      const data = await res.json();
      if (res.ok) {
        setFriends(data.friends || []);
        setIncoming(data.pendingRequests || []);
        setOutgoing(data.outgoingRequests || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/profile/${searchQuery.trim()}`);
    }
  };

  const handleAccept = async (requestId: string) => {
    try {
      const res = await fetch('/api/friends/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId })
      });
      if (res.ok) {
        // Refresh silently instead of full reload
        fetchData();
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleDecline = async (friendshipId: string) => {
    try {
      const res = await fetch('/api/friends/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendshipId })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleChallenge = (username: string) => {
    // Navigate to challenge page with friend preset
    router.push(`/battle?challenge=${username}`);
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans text-slate-200">
      <Navbar username={session?.user?.name || ''} currency={0} />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          
          <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 flex items-center gap-3">
              <Users size={40} className="text-indigo-500" />
              Friends
            </h1>

            <form onSubmit={handleSearch} className="w-full sm:w-auto flex gap-2">
              <input
                type="text"
                placeholder="Search players..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none text-white"
              />
              <button 
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-bold transition-colors"
                disabled={!searchQuery.trim()}
              >
                Find
              </button>
            </form>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* Friends List (Main Col) */}
            <div className="md:col-span-2 space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <Shield className="text-indigo-400" /> Alliance Members ({friends.length})
                </h2>
                
                {friends.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 bg-slate-800/20 rounded-xl border border-dashed border-slate-700">
                    You haven't formed any alliances yet.
                    <br /> Search for players to add them as friends!
                  </div>
                ) : (
                  <div className="space-y-3">
                    {friends.map((friendConnection) => (
                      <div key={friendConnection.friendshipId} className="flex items-center justify-between p-4 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-all group">
                        <Link href={`/profile/${friendConnection.user.username}`} className="flex items-center gap-4 flex-1">
                          <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                            {friendConnection.user.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-white group-hover:text-indigo-300 transition-colors">
                              {friendConnection.user.username}
                            </div>
                            <div className="text-xs text-slate-400 font-medium">
                              Level {friendConnection.user.level} Developer
                            </div>
                          </div>
                        </Link>
                        
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleChallenge(friendConnection.user.username)}
                            className="bg-slate-700 hover:bg-rose-600/20 hover:text-rose-400 text-slate-300 border border-slate-600 hover:border-rose-500/50 p-2 rounded-lg transition-all"
                            title="Challenge to Duel"
                          >
                            <Sword size={20} weight="fill" />
                          </button>
                          <button 
                            onClick={() => handleDecline(friendConnection.friendshipId)} // Decline and remove share the same endpoint structure visually
                            className="bg-slate-700 hover:bg-red-500 text-slate-300 hover:text-white p-2 text-sm rounded-lg transition-all border border-slate-600 hover:border-red-600"
                            title="Remove Friend"
                          >
                            <X size={20} weight="bold" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Requests Col */}
            <div className="space-y-6">
              
              {/* Incoming Requests */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h3 className="font-bold text-white mb-4 flex items-center justify-between">
                  Incoming 
                  {incoming.length > 0 && (
                    <span className="bg-indigo-500 text-white text-xs px-2 py-0.5 rounded-full">{incoming.length}</span>
                  )}
                </h3>
                
                {incoming.length === 0 ? (
                  <p className="text-sm text-slate-500">No pending requests</p>
                ) : (
                  <div className="space-y-3">
                     {incoming.map((req) => (
                       <div key={req.id} className="p-3 bg-slate-800 rounded-xl border border-slate-700 text-sm">
                         <Link href={`/profile/${req.user.username}`} className="font-bold text-indigo-400 hover:underline inline-block mb-2">
                           {req.user.username}
                         </Link>
                         <p className="text-slate-400 text-xs mb-3">Lvl {req.user.level}</p>
                         <div className="flex gap-2">
                           <button onClick={() => handleAccept(req.id)} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-1.5 rounded-lg flex justify-center transition-colors">
                             <Check size={16} weight="bold" />
                           </button>
                           <button onClick={() => handleDecline(req.id)} className="flex-1 bg-slate-700 hover:bg-red-500 text-white py-1.5 rounded-lg flex justify-center transition-colors border border-slate-600 hover:border-red-600">
                             <X size={16} weight="bold" />
                           </button>
                         </div>
                       </div>
                     ))}
                  </div>
                )}
              </div>

              {/* Outgoing Requests */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h3 className="font-bold text-slate-400 mb-4 text-sm uppercase tracking-wider">Outgoing</h3>
                
                {outgoing.length === 0 ? (
                  <p className="text-sm text-slate-600">No outgoing requests</p>
                ) : (
                  <div className="space-y-2">
                     {outgoing.map((req) => (
                       <div key={req.id} className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg border border-slate-700">
                         <span className="text-sm text-slate-300 truncate font-medium">{req.user.username}</span>
                         <button onClick={() => handleDecline(req.id)} className="text-slate-500 hover:text-red-400 p-1">
                           <X size={14} weight="bold" />
                         </button>
                       </div>
                     ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
