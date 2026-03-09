'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
import { Trophy, Users, Sword, Plus, UserMinus, Clock } from '@phosphor-icons/react';
import { Navbar } from '@/components/Navbar';

interface ProfileData {
  user: {
    id: string;
    username: string;
    level: number;
    xp: number;
    rating: number;
    createdAt: string;
  };
  stats: {
    totalCards: number;
    battlesWon: number;
    battlesLost: number;
    totalBattles: number;
    friendsCount: number;
  };
  topCards: any[];
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const params = useParams();
  const profileUsername = params.username as string;

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [friendStatus, setFriendStatus] = useState<'NONE' | 'PENDING' | 'FRIENDS'>('NONE');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
    if (session?.user?.email && profileUsername !== session.user.name) {
      checkFriendStatus();
    }
  }, [profileUsername, session]);

  const fetchProfile = async () => {
    try {
      const res = await fetch(`/api/profile/${profileUsername}`);
      const data = await res.json();
      if (res.ok) {
        setProfile(data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const checkFriendStatus = async () => {
    try {
      const res = await fetch('/api/friends');
      const data = await res.json();
      
      if (res.ok) {
        const isFriend = data.friends.find((f: any) => f.user.username === profileUsername);
        if (isFriend) {
          setFriendStatus('FRIENDS');
          setFriendshipId(isFriend.friendshipId);
          return;
        }

        const isOutgoing = data.outgoingRequests.find((r: any) => r.user.username === profileUsername);
        if (isOutgoing) {
          setFriendStatus('PENDING');
          setFriendshipId(isOutgoing.id);
          return;
        }

        // We aren't checking incoming here but could. Simple checking for now.
        setFriendStatus('NONE');
      }
    } catch (err) {
      console.error('Failed to check friend status', err);
    }
  };

  const handleAddFriend = async () => {
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUsername: profileUsername })
      });
      if (res.ok) {
        setFriendStatus('PENDING');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveFriend = async () => {
    if (!friendshipId) return;
    try {
      const res = await fetch('/api/friends/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendshipId })
      });
      if (res.ok) {
        setFriendStatus('NONE');
        setFriendshipId(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const isOwnProfile = session?.user?.name === profileUsername;

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
    </div>
  );

  if (error || !profile) return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Navbar username={session?.user?.name || ''} currency={0} />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-slate-300">User Not Found</h2>
          <p className="text-slate-500 mt-2">{error}</p>
        </div>
      </div>
    </div>
  );

  // We could fetch real bits for navbar but skipping for simplicity this is just profile
  const winRate = profile.stats.totalBattles > 0 
    ? Math.round((profile.stats.battlesWon / profile.stats.totalBattles) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans text-slate-200">
      <Navbar username={session?.user?.name || ''} currency={0} />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Header Profile Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-indigo-900/40 to-purple-900/40 opacity-50"></div>
            
            <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-6 z-10">
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-5xl font-black text-white shadow-[0_0_30px_rgba(99,102,241,0.3)] ring-4 ring-slate-900">
                {profile.user.username.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 text-center sm:text-left">
                <h1 className="text-4xl font-black tracking-tight text-white mb-2">{profile.user.username}</h1>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-sm font-medium">
                  <span className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    Lvl {profile.user.level} Developer
                  </span>
                  <span className="flex items-center gap-1 text-yellow-500">
                    <Trophy size={16} weight="fill" />
                    {profile.user.rating} Elo
                  </span>
                  <span className="text-slate-400">
                    Joined {new Date(profile.user.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {!isOwnProfile && session?.user && (
                <div className="flex flex-col gap-3 mt-4 sm:mt-0 w-full sm:w-auto">
                  {friendStatus === 'NONE' && (
                    <button 
                      onClick={handleAddFriend}
                      className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all"
                    >
                      <Plus size={20} weight="bold" /> Add Friend
                    </button>
                  )}
                  {friendStatus === 'PENDING' && (
                    <button 
                      disabled
                      className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-800 text-slate-400 font-bold border border-slate-700 cursor-not-allowed"
                    >
                      <Clock size={20} weight="bold" /> Request Sent
                    </button>
                  )}
                  {friendStatus === 'FRIENDS' && (
                    <button 
                      onClick={handleRemoveFriend}
                      className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-red-900/30 hover:bg-red-900/50 text-red-400 font-bold border border-red-900/50 transition-all"
                    >
                      <UserMinus size={20} weight="bold" /> Remove Friend
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
              <Sword size={32} className="text-rose-500 mb-2" />
              <div className="text-3xl font-black text-white">{profile.stats.totalBattles}</div>
              <div className="text-slate-400 text-sm font-medium mt-1">Total Battles</div>
            </div>
            
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-b from-green-500/5 to-transparent"></div>
              <div className="text-3xl font-black text-green-400 relative z-10">{winRate}%</div>
              <div className="text-slate-400 text-sm font-medium mt-1 relative z-10">Win Rate</div>
              <div className="text-xs text-slate-500 mt-1 relative z-10">{profile.stats.battlesWon}W - {profile.stats.battlesLost}L</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
              <div className="text-3xl font-black text-indigo-400">{profile.stats.totalCards}</div>
              <div className="text-slate-400 text-sm font-medium mt-1">Cards Owned</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
              <Users size={32} className="text-blue-400 mb-2" />
              <div className="text-3xl font-black text-white">{profile.stats.friendsCount}</div>
              <div className="text-slate-400 text-sm font-medium mt-1">Friends</div>
            </div>
          </div>

          {/* Top Cards Showcase */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
            <h2 className="text-2xl font-black text-white mb-6">Top Developers Showcase</h2>
            {profile.topCards.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {profile.topCards.map((card, i) => (
                  <div key={i} className={`relative p-3 rounded-xl border flex flex-col items-center text-center \${card.isShiny ? 'bg-gradient-to-b from-yellow-900/40 to-amber-900/10 border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.2)]' : 'bg-slate-800/50 border-slate-700'}`}>
                    <img src={card.avatarUrl || `https://github.com/\${card.githubUsername}.png`} alt={card.name} className="w-16 h-16 rounded-full mb-3" />
                    <div className="font-bold text-xs line-clamp-1 mb-1">{card.name}</div>
                    <div className="flex gap-2 text-[10px] font-bold text-slate-400">
                      <span>\u2694\uFE0F {card.atk}</span>
                      <span>\uD83D\uDEE1\uFE0F {card.def}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500 bg-slate-800/20 rounded-xl border border-dashed border-slate-700">
                This user hasn't collected any cards yet.
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
