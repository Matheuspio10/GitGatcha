'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { 
  Trophy, Shield, Sword, Heart, UserPlus, 
  Users, UserMinus, UserCheck, Star, Envelope,
  Sparkle, ShieldCheck, Fire, Plus, Clock
} from '@phosphor-icons/react';
import { Navbar } from '@/components/Navbar';
import { getXPProgress } from '@/lib/xpService';
import { Card } from '@/components/Card';

interface FriendInfo {
  id: string;
  username: string;
  level: number;
}

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
  friends: FriendInfo[];
  hasLeveledUpRecently: boolean;
  hasLegendaryBondPrestige: boolean;
  showcaseCards: any[];
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const params = useParams();
  const profileUsername = decodeURIComponent(params.username as string);

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

  const isOwnProfile = (session?.user as any)?.username === profileUsername || session?.user?.name === profileUsername;

  if (loading) return (
    <div className="flex flex-col items-center justify-center flex-1 py-32">
      <div className="animate-spin rounded-full h-14 w-14 border-b-4 border-indigo-500"></div>
    </div>
  );

  if (error || !profile) return (
    <div className="flex-1 flex flex-col items-center justify-center py-32">
      <div className="text-center bg-slate-900/50 p-12 rounded-3xl border border-slate-800 backdrop-blur-md">
        <h2 className="text-4xl font-black mb-2 text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-red-500">User Not Found</h2>
        <p className="text-slate-400 font-medium text-lg">{error}</p>
      </div>
    </div>
  );

  // We could fetch real bits for navbar but skipping for simplicity this is just profile
  const winRate = profile.stats.totalBattles > 0 
    ? Math.round((profile.stats.battlesWon / profile.stats.totalBattles) * 100) 
    : 0;

  const xpData = getXPProgress(profile.user.xp);

  return (
    <div className="font-sans text-slate-200">
        <div className="max-w-4xl mx-auto space-y-8">
          
          {/* Premium Header Profile Card */}
          <div className="relative rounded-[2rem] p-px overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-blue-500/20 z-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            
            <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 sm:p-10 relative z-10 overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[100px] rounded-full"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 blur-[100px] rounded-full"></div>
              
              <div className="relative flex flex-col md:flex-row items-center md:items-start gap-8 z-10">
                {/* Avatar */}
                <div className="relative">
                  <div className="absolute -inset-1 bg-gradient-to-br from-indigo-500 via-purple-500 to-blue-500 rounded-full blur opacity-75 group-hover:opacity-100 transition duration-500 group-hover:scale-105"></div>
                  <div className="relative w-36 h-36 rounded-full bg-slate-950 flex items-center justify-center text-6xl font-black text-white ring-4 ring-slate-900 border-2 border-indigo-500/50">
                    <span className="text-transparent bg-clip-text bg-gradient-to-br from-indigo-400 to-purple-400">
                      {profile.user.username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Profile Info */}
                <div className="flex-1 text-center md:text-left mt-2">
                  <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 tracking-tight leading-none mb-3">
                    {profile.user.username}
                  </h1>
                  
                  {/* Active Badges */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-800/80 border border-slate-700 rounded-full text-xs font-bold text-slate-300 shadow-inner">
                      <Star weight="fill" className="text-yellow-500" />
                      Level {profile.user.level}
                    </span>
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-xs font-bold text-indigo-400">
                      <Trophy weight="fill" />
                      {profile.user.rating} Rating
                    </span>
                    {profile.hasLegendaryBondPrestige && (
                      <span className="flex items-center gap-1.5 px-3 py-1 bg-pink-500/10 border border-pink-500/30 rounded-full text-xs font-bold text-pink-400 shadow-[0_0_15px_rgba(236,72,153,0.3)] animate-pulse">
                        <Sparkle weight="fill" />
                        Legendary Bond
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-400/10 px-4 py-1.5 rounded-full border border-emerald-400/20">
                      <Sword size={18} weight="fill" />
                      {winRate}% Win Rate
                    </span>
                    <span className={`px-4 py-1.5 rounded-full border shadow-[0_0_15px_rgba(99,102,241,0.2)] transition-all ${
                        profile.hasLeveledUpRecently 
                          ? 'bg-yellow-500/20 text-yellow-300 border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.6)] animate-pulse ring-2 ring-yellow-400 ring-offset-2 ring-offset-slate-900'
                          : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                      }`}>
                      Level {xpData.currentLevel} Developer
                    </span>
                  </div>

                  {/* XP Progress Bar */}
                  <div className="mt-8 w-full max-w-md">
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-400">XP Progress</span>
                      <span className="text-sm font-bold text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                        {Math.floor(xpData.progressPercent)}%
                      </span>
                    </div>
                    
                    <div className="relative h-4 w-full bg-slate-950 rounded-full overflow-hidden border border-white/10 shadow-inner">
                      <div 
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${Math.max(5, xpData.progressPercent)}%` }} // Minimum width for visibility
                      >
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 mix-blend-overlay"></div>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center mt-2 text-xs font-medium text-slate-500">
                      <span>{Math.floor(xpData.totalXP).toLocaleString()} XP Total</span>
                      <span>{Math.floor(xpData.xpIntoLevel).toLocaleString()} / {Math.floor(xpData.xpNeededForNext).toLocaleString()} to Lvl {xpData.currentLevel + 1}</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-3 mt-4 md:mt-2 w-full md:w-auto">
                  {isOwnProfile ? (
                    <button className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-all border border-slate-600 hover:border-slate-500 hover:shadow-lg">
                      Edit Profile
                    </button>
                  ) : session?.user ? (
                    <>
                      {friendStatus === 'NONE' && (
                        <button 
                          onClick={handleAddFriend}
                          className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-black transition-all shadow-[0_0_20px_rgba(79,70,229,0.4)] hover:shadow-[0_0_30px_rgba(79,70,229,0.6)] hover:-translate-y-0.5"
                        >
                          <Plus size={20} weight="bold" /> Add Friend
                        </button>
                      )}
                      {friendStatus === 'PENDING' && (
                        <button 
                          disabled
                          className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-slate-800 text-slate-400 font-bold border border-slate-700 cursor-not-allowed opacity-80"
                        >
                          <Clock size={20} weight="bold" /> Request Sent
                        </button>
                      )}
                      {friendStatus === 'FRIENDS' && (
                        <button 
                          onClick={handleRemoveFriend}
                          className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-red-900/30 hover:bg-red-500 text-red-400 hover:text-white font-bold border border-red-900/50 hover:border-red-500 transition-all"
                        >
                          <UserMinus size={20} weight="bold" /> Remove Friend
                        </button>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* Premium Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            <div className="group bg-slate-900/80 backdrop-blur-sm border border-slate-800 hover:border-rose-500/50 rounded-[2rem] p-6 flex flex-col items-center justify-center text-center transition-all hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(244,63,94,0.3)]">
              <div className="w-12 h-12 bg-rose-500/10 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Sword size={24} className="text-rose-500" weight="duotone" />
              </div>
              <div className="text-4xl font-black text-white tracking-tight">{profile.stats.totalBattles}</div>
              <div className="text-slate-400 text-sm font-semibold mt-1 uppercase tracking-wider">Total Battles</div>
            </div>
            
            <div className="group bg-slate-900/80 backdrop-blur-sm border border-slate-800 hover:border-emerald-500/50 rounded-[2rem] p-6 flex flex-col items-center justify-center text-center transition-all hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(16,185,129,0.3)] relative overflow-hidden">
              <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
              <div className="text-4xl font-black text-emerald-400 tracking-tight">{winRate}%</div>
              <div className="text-slate-400 text-sm font-semibold mt-1 uppercase tracking-wider">Win Rate</div>
              <div className="text-xs font-bold text-slate-500 bg-slate-800 px-3 py-1 rounded-full mt-3">
                <span className="text-emerald-500">{profile.stats.battlesWon}W</span> - <span className="text-rose-500">{profile.stats.battlesLost}L</span>
              </div>
            </div>

            <div className="group bg-slate-900/80 backdrop-blur-sm border border-slate-800 hover:border-indigo-500/50 rounded-[2rem] p-6 flex flex-col items-center justify-center text-center transition-all hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(99,102,241,0.3)]">
              <div className="text-4xl font-black text-indigo-400 tracking-tight">{profile.stats.totalCards}</div>
              <div className="text-slate-400 text-sm font-semibold mt-1 uppercase tracking-wider">Cards Owned</div>
            </div>

            <div className="group bg-slate-900/80 backdrop-blur-sm border border-slate-800 hover:border-blue-500/50 rounded-[2rem] p-6 flex flex-col items-center justify-center text-center transition-all hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(59,130,246,0.3)]">
              <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Users size={24} className="text-blue-400" weight="duotone" />
              </div>
              <div className="text-4xl font-black text-white tracking-tight">{profile.stats.friendsCount}</div>
              <div className="text-slate-400 text-sm font-semibold mt-1 uppercase tracking-wider">Friends</div>
            </div>
          </div>

          {/* Hall of Fame / Showcase */}
          {profile.showcaseCards && profile.showcaseCards.length > 0 && (
            <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-[2rem] p-8 sm:p-10 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 blur-[120px] rounded-full pointer-events-none"></div>
              <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-yellow-500 mb-2 flex items-center gap-3 relative z-10">
                <Trophy size={32} weight="duotone" className="text-yellow-400" />
                Hall of Fame
              </h2>
              <p className="text-slate-400 text-sm font-medium mb-8 relative z-10 max-w-2xl">
                The most loyal cards in {profile.user.username}'s collection, battle-tested and forged through countless victories.
              </p>
              
              <div className="flex flex-none overflow-x-auto gap-6 sm:gap-8 pb-8 pt-2 snap-x snap-mandatory hide-scrollbar relative z-10">
                {profile.showcaseCards.map((card: any) => (
                  <div key={card.id} className="snap-center sm:snap-start shrink-0">
                    <Card
                      id={card.id}
                      name={card.name}
                      githubUsername={card.githubUsername}
                      avatarUrl={card.avatarUrl || ''}
                      flavorText={card.flavorText}
                      atk={card.atk}
                      def={card.def}
                      hp={card.hp}
                      rarity={card.rarity}
                      primaryLanguage={card.primaryLanguage || 'Unknown'}
                      quantity={card.quantity}
                      disableLink={false}
                      isShiny={card.isShiny}
                      loyaltyTier={card.loyaltyTier}
                      loyaltyCount={card.loyaltyCount}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Cards Showcase */}
          <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-[2rem] p-8 sm:p-10 shadow-xl">
            <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 mb-8 flex items-center gap-3">
              Top Developers
              <span className="px-3 py-1 bg-slate-800 text-xs text-slate-400 font-bold rounded-full uppercase tracking-widest border border-slate-700">Display Showcase</span>
            </h2>
            
            {profile.topCards.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 sm:gap-6">
                {profile.topCards.map((card, i) => (
                  <div key={i} className={`relative pt-6 pb-4 px-3 rounded-2xl border flex flex-col items-center text-center transition-all hover:-translate-y-2 ${card.isShiny ? 'bg-gradient-to-b from-amber-900/40 to-yellow-900/10 border-yellow-500/50 shadow-[0_10px_25px_-5px_rgba(234,179,8,0.3)] hover:shadow-[0_15px_35px_-5px_rgba(234,179,8,0.5)]' : 'bg-slate-800/40 border-slate-700 hover:border-indigo-500/50 hover:shadow-[0_10px_25px_-5px_rgba(99,102,241,0.2)]'}`}>
                    {card.isShiny && (
                      <div className="absolute top-0 right-0 m-2">
                        <span className="flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                        </span>
                      </div>
                    )}
                    <img src={card.avatarUrl || `https://github.com/${card.githubUsername}.png`} alt={card.name} className={`w-20 h-20 rounded-full mb-4 shadow-lg ${card.isShiny ? 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-slate-900' : ''}`} />
                    <div className="font-black text-sm line-clamp-1 mb-2 text-white">{card.name}</div>
                    <div className="flex gap-2 text-[10px] font-bold bg-slate-950/50 px-3 py-1.5 rounded-lg border border-white/5 flex-wrap justify-center">
                      <span className="text-rose-400 flex items-center gap-1">⚔️ {card.atk}</span>
                      <span className="text-emerald-400 flex items-center gap-1">🛡️ {card.def}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-slate-500 bg-slate-800/20 rounded-[2rem] border-2 border-dashed border-slate-700/50 flex flex-col items-center">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4 text-2xl text-slate-500">
                  😔
                </div>
                <p className="font-bold text-lg">No collection yet.</p>
                <p className="text-sm mt-1">This user hasn't collected any developers.</p>
              </div>
            )}
          </div>

          {/* Friends List */}
          <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-[2rem] p-8 sm:p-10 shadow-xl">
            <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 mb-8 flex items-center gap-3">
              <Users size={28} weight="duotone" className="text-blue-400" />
              Friends
              <span className="px-3 py-1 bg-slate-800 text-xs text-slate-400 font-bold rounded-full uppercase tracking-widest border border-slate-700">
                {profile.friends.length}
              </span>
              {isOwnProfile && (
                <Link
                  href="/friends"
                  className="ml-auto text-sm font-bold text-indigo-400 hover:text-indigo-300 transition-colors px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 hover:border-indigo-500/40 hover:bg-indigo-500/15"
                >
                  Manage Friends →
                </Link>
              )}
            </h2>

            {profile.friends.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {profile.friends.map((friend) => (
                  <Link
                    key={friend.id}
                    href={`/profile/${friend.username}`}
                    className="group flex flex-col items-center text-center p-5 rounded-2xl border border-slate-700 bg-slate-800/30 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all hover:-translate-y-1 hover:shadow-[0_10px_30px_-10px_rgba(99,102,241,0.3)]"
                  >
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-2xl mb-3 group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all">
                      {friend.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="font-bold text-sm text-white group-hover:text-indigo-300 transition-colors line-clamp-1">
                      {friend.username}
                    </div>
                    <div className="text-xs text-slate-500 font-medium mt-1">
                      Level {friend.level}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500 bg-slate-800/20 rounded-2xl border-2 border-dashed border-slate-700/50 flex flex-col items-center">
                <Users size={40} className="mb-3 opacity-40" />
                <p className="font-bold text-lg">No friends yet.</p>
                <p className="text-sm mt-1">This user hasn't added any friends.</p>
              </div>
            )}
          </div>

        </div>
    </div>
  );
}
