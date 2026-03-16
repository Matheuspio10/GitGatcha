'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { 
  Trophy, Sword, UserPlus, 
  Users, UserMinus, Star,
  Sparkle, Plus, Clock,
  ShareNetwork, Coin, Lightning, Medal,
  Lock, Info, CaretDown, CaretUp, Copy, Check
} from '@phosphor-icons/react';
import { getXPProgress } from '@/lib/xpService';
import { Card } from '@/components/Card';
import { UserAvatar } from '@/components/UserAvatar';
import { EditProfileModal } from '@/components/EditProfileModal';
import { motion, AnimatePresence } from 'framer-motion';

interface FriendInfo {
  id: string;
  username: string;
  level: number;
  image?: string | null;
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
}

interface RecentBattle {
  id: string;
  opponentUsername: string;
  opponentImage?: string | null;
  leagueMode: string;
  won: boolean;
  playerScore: number;
  opponentScore: number;
  date: string;
  challengerTeam: any;
  defenderTeam: any;
  log: any;
  isChallenger: boolean;
}

interface ProfileData {
  user: {
    id: string;
    username: string;
    level: number;
    xp: number;
    rating: number;
    createdAt: string;
    image?: string | null;
    bio?: string | null;
    bannerImage?: string | null;
    preferredLanguage?: string | null;
  };
  stats: {
    totalCards: number;
    battlesWon: number;
    battlesLost: number;
    totalBattles: number;
    friendsCount: number;
    totalBitsEarned: number;
    highestWinStreak: number;
  };
  topCards: any[];
  friends: FriendInfo[];
  recentBattles: RecentBattle[];
  achievements: Achievement[];
  hasLeveledUpRecently: boolean;
  hasLegendaryBondPrestige: boolean;
  showcaseCards: any[];
}

const LANGUAGE_COLORS: Record<string, string> = {
  'JavaScript': '#f7df1e', 'TypeScript': '#3178c6', 'Python': '#3776ab',
  'Java': '#f89820', 'C++': '#00599c', 'C#': '#68217a', 'Go': '#00add8',
  'Rust': '#ce412b', 'Ruby': '#cc342d', 'Swift': '#fa7343', 'Kotlin': '#7f52ff',
  'PHP': '#777bb4', 'Dart': '#0175c2', 'Scala': '#dc322f', 'Elixir': '#6e4a7e',
  'Haskell': '#5e5086', 'Lua': '#000080', 'R': '#276dc3', 'Shell': '#89e051',
};

const LOYALTY_TIER_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  'none': { label: 'Unranked', color: 'text-slate-500', bg: 'bg-slate-800' },
  'rookie': { label: 'Rookie', color: 'text-slate-400', bg: 'bg-slate-800' },
  'veteran': { label: 'Veteran', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  'trusted': { label: 'Trusted', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  'reliable': { label: 'Reliable', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  'legendary_bond': { label: 'Legendary Bond', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  'eternal': { label: 'Eternal', color: 'text-pink-400', bg: 'bg-pink-500/10' },
};

const LEAGUE_LABELS: Record<string, { label: string; color: string }> = {
  'OPEN': { label: 'Open', color: 'text-slate-300' },
  'COMMON': { label: 'Common', color: 'text-green-400' },
  'BALANCED': { label: 'Balanced', color: 'text-blue-400' },
  'DIVERSITY': { label: 'Diversity', color: 'text-purple-400' },
  'LEGENDARY': { label: 'Legendary', color: 'text-amber-400' },
};

const PRESET_GRADIENTS: Record<string, string> = {
  'preset:cyber': 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
  'preset:aurora': 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
  'preset:ember': 'linear-gradient(135deg, #1a0a00, #3d1f00, #0d0d0d)',
  'preset:ocean': 'linear-gradient(135deg, #000428, #004e92, #000428)',
  'preset:void': 'linear-gradient(135deg, #0a0a0a, #1a1a2e, #16213e)',
  'preset:neon': 'linear-gradient(135deg, #0d0221, #150050, #3f0071)',
};

function getBannerStyle(bannerImage?: string | null): React.CSSProperties {
  if (!bannerImage) return { background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' };
  if (bannerImage.startsWith('preset:')) return { background: PRESET_GRADIENTS[bannerImage] || 'linear-gradient(135deg, #0f172a, #1e1b4b)' };
  if (bannerImage.startsWith('color:')) return { backgroundColor: bannerImage.replace('color:', '') };
  return { backgroundImage: `url(${bannerImage})`, backgroundSize: 'cover', backgroundPosition: 'center' };
}

export default function ProfilePage() {
  const { data: session, update: updateSession } = useSession();
  const params = useParams();
  const profileUsername = decodeURIComponent(params.username as string);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [friendStatus, setFriendStatus] = useState<'NONE' | 'PENDING' | 'FRIENDS'>('NONE');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedBattle, setExpandedBattle] = useState<string | null>(null);
  const [achievementPopover, setAchievementPopover] = useState<string | null>(null);

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
      if (res.ok) setProfile(data);
      else setError(data.error);
    } catch { setError('Failed to load profile'); }
    finally { setLoading(false); }
  };

  const checkFriendStatus = async () => {
    try {
      const res = await fetch('/api/friends', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) {
        const isFriend = data.friends.find((f: any) => (f.user.username || '').toLowerCase() === profileUsername.toLowerCase());
        if (isFriend) { setFriendStatus('FRIENDS'); setFriendshipId(isFriend.friendshipId); return; }
        const isOutgoing = data.outgoingRequests.find((r: any) => (r.user.username || '').toLowerCase() === profileUsername.toLowerCase());
        if (isOutgoing) { setFriendStatus('PENDING'); setFriendshipId(isOutgoing.id); return; }
        setFriendStatus('NONE');
      }
    } catch (err) { console.error('Failed to check friend status', err); }
  };

  const handleAddFriend = async () => {
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUsername: profileUsername })
      });
      if (res.ok) setFriendStatus('PENDING');
    } catch (err) { console.error(err); }
  };

  const handleRemoveFriend = async () => {
    if (!friendshipId) return;
    try {
      const res = await fetch('/api/friends/remove', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendshipId })
      });
      if (res.ok) { setFriendStatus('NONE'); setFriendshipId(null); }
    } catch (err) { console.error(err); }
  };

  const handleShareProfile = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  const winRate = profile.stats.totalBattles > 0 
    ? Math.round((profile.stats.battlesWon / profile.stats.totalBattles) * 100) : 0;
  const xpData = getXPProgress(profile.user.xp);

  return (
    <div className="font-sans text-slate-200">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* ═══════════ HEADER WITH BANNER ═══════════ */}
        <div className="relative rounded-[2rem] overflow-hidden group">
          {/* Banner */}
          <div className="h-40 sm:h-52 relative" style={getBannerStyle(profile.user.bannerImage)}>
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
          </div>

          {/* Profile Content */}
          <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-b-[2rem] px-8 sm:px-10 pb-8 pt-0 relative z-10 -mt-20 shadow-2xl">
            <div className="relative flex flex-col md:flex-row items-center md:items-end gap-6 z-10">
              {/* Avatar */}
              <div className="relative -mt-16 md:-mt-20">
                <div className="absolute -inset-1 bg-gradient-to-br from-indigo-500 via-purple-500 to-blue-500 rounded-full blur opacity-75 group-hover:opacity-100 transition duration-500"></div>
                <div className="relative ring-4 ring-slate-900 rounded-full">
                  <UserAvatar
                    username={profile.user.username}
                    image={profile.user.image}
                    size="xl"
                    showUploadHint={isOwnProfile}
                    onClick={isOwnProfile ? () => setShowEditModal(true) : undefined}
                  />
                </div>
                {/* Camera icon overlay for own profile */}
                {isOwnProfile && (
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="absolute bottom-1 right-1 w-9 h-9 bg-indigo-600 hover:bg-indigo-500 rounded-full flex items-center justify-center text-white shadow-lg border-2 border-slate-900 transition-colors md:opacity-0 md:group-hover:opacity-100"
                  >
                    <span className="text-sm">📷</span>
                  </button>
                )}
              </div>

              {/* Profile Info */}
              <div className="flex-1 text-center md:text-left mt-2 md:mt-0 md:pb-2">
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-1">
                  <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 tracking-tight leading-none">
                    {profile.user.username}
                  </h1>
                  {profile.user.preferredLanguage && (
                    <span
                      className="px-2.5 py-1 rounded-full text-xs font-bold border"
                      style={{
                        backgroundColor: `${LANGUAGE_COLORS[profile.user.preferredLanguage] || '#666'}20`,
                        borderColor: `${LANGUAGE_COLORS[profile.user.preferredLanguage] || '#666'}50`,
                        color: LANGUAGE_COLORS[profile.user.preferredLanguage] || '#999',
                      }}
                    >
                      {profile.user.preferredLanguage}
                    </span>
                  )}
                </div>
                
                {/* Bio */}
                <p className="text-sm text-slate-400 mb-3 max-w-md">
                  {profile.user.bio || <span className="italic text-slate-600">No bio yet</span>}
                </p>

                {/* Active Badges */}
                <div className="flex flex-wrap gap-2 mb-4 justify-center md:justify-start">
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
                  <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full border border-emerald-400/20 text-xs font-bold">
                    <Sword size={14} weight="fill" />
                    {winRate}% Win Rate
                  </span>
                </div>

                {/* XP Progress Bar — Own profile only */}
                {isOwnProfile && (
                  <div className="w-full max-w-md">
                    <div className="flex justify-between items-end mb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">XP Progress</span>
                      <span className="text-xs font-bold text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                        {Math.floor(xpData.progressPercent)}%
                      </span>
                    </div>
                    <div className="relative h-3 w-full bg-slate-950 rounded-full overflow-hidden border border-white/10 shadow-inner">
                      <div 
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${Math.max(5, xpData.progressPercent)}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center mt-1 text-[10px] font-medium text-slate-600">
                      <span>{Math.floor(xpData.totalXP).toLocaleString()} XP</span>
                      <span>{Math.floor(xpData.xpIntoLevel).toLocaleString()} / {Math.floor(xpData.xpNeededForNext).toLocaleString()} to Lvl {xpData.currentLevel + 1}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 mt-2 md:mt-0 md:self-start md:pt-4 w-full md:w-auto">
                {isOwnProfile ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowEditModal(true)}
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-all border border-slate-600 hover:border-slate-500 text-sm"
                    >
                      Edit Profile
                    </button>
                    <button
                      onClick={handleShareProfile}
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-all border border-slate-600 hover:border-slate-500 text-sm"
                      title="Copy profile link"
                    >
                      {copied ? <Check size={18} className="text-emerald-400" /> : <ShareNetwork size={18} />}
                    </button>
                  </div>
                ) : session?.user ? (
                  <div className="flex gap-2">
                    {friendStatus === 'NONE' && (
                      <button onClick={handleAddFriend} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-black transition-all shadow-[0_0_20px_rgba(79,70,229,0.4)] text-sm">
                        <Plus size={18} weight="bold" /> Add Friend
                      </button>
                    )}
                    {friendStatus === 'PENDING' && (
                      <button disabled className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-800 text-slate-400 font-bold border border-slate-700 cursor-not-allowed opacity-80 text-sm">
                        <Clock size={18} weight="bold" /> Request Sent
                      </button>
                    )}
                    {friendStatus === 'FRIENDS' && (
                      <button onClick={handleRemoveFriend} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-red-900/30 hover:bg-red-500 text-red-400 hover:text-white font-bold border border-red-900/50 hover:border-red-500 transition-all text-sm">
                        <UserMinus size={18} weight="bold" /> Remove
                      </button>
                    )}
                    <button
                      onClick={handleShareProfile}
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-all border border-slate-600 text-sm"
                    >
                      {copied ? <Check size={18} className="text-emerald-400" /> : <ShareNetwork size={18} />}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════ STATS GRID — 6 Items ═══════════ */}
        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 snap-x snap-mandatory hide-scrollbar">
          {[
            { label: 'Total Battles', value: profile.stats.totalBattles, icon: <Sword size={20} className="text-rose-500" weight="duotone" />, hoverBorder: 'hover:border-rose-500/50', hoverShadow: 'hover:shadow-[0_8px_30px_-8px_rgba(244,63,94,0.3)]' },
            { label: 'Win Rate', value: `${winRate}%`, icon: null, color: 'text-emerald-400', hoverBorder: 'hover:border-emerald-500/50', hoverShadow: 'hover:shadow-[0_8px_30px_-8px_rgba(16,185,129,0.3)]', sub: <span className="text-[10px] font-bold text-slate-500"><span className="text-emerald-500">{profile.stats.battlesWon}W</span> · <span className="text-rose-500">{profile.stats.battlesLost}L</span></span> },
            { label: 'Cards Owned', value: profile.stats.totalCards, color: 'text-indigo-400', hoverBorder: 'hover:border-indigo-500/50', hoverShadow: 'hover:shadow-[0_8px_30px_-8px_rgba(99,102,241,0.3)]' },
            { label: 'Friends', value: profile.stats.friendsCount, icon: <Users size={20} className="text-blue-400" weight="duotone" />, hoverBorder: 'hover:border-blue-500/50', hoverShadow: 'hover:shadow-[0_8px_30px_-8px_rgba(59,130,246,0.3)]' },
            { label: 'BITS Earned', value: profile.stats.totalBitsEarned.toLocaleString(), icon: <Coin size={20} className="text-yellow-500" weight="fill" />, color: 'text-yellow-400', hoverBorder: 'hover:border-yellow-500/50', hoverShadow: 'hover:shadow-[0_8px_30px_-8px_rgba(234,179,8,0.3)]' },
            { label: 'Best Streak', value: profile.stats.highestWinStreak, icon: <Lightning size={20} className="text-orange-500" weight="fill" />, color: 'text-orange-400', hoverBorder: 'hover:border-orange-500/50', hoverShadow: 'hover:shadow-[0_8px_30px_-8px_rgba(249,115,22,0.3)]' },
          ].map((stat, i) => (
            <div key={i} className={`snap-start shrink-0 w-[calc(50%-6px)] sm:w-[calc(33.3%-11px)] md:w-0 md:flex-1 group bg-slate-900/80 backdrop-blur-sm border border-slate-800 ${stat.hoverBorder} rounded-2xl p-4 flex flex-col items-center justify-center text-center transition-all hover:-translate-y-1 ${stat.hoverShadow}`}>
              {stat.icon && <div className="mb-2">{stat.icon}</div>}
              <div className={`text-2xl sm:text-3xl font-black tracking-tight ${stat.color || 'text-white'}`}>{stat.value}</div>
              <div className="text-slate-400 text-[10px] sm:text-xs font-semibold mt-1 uppercase tracking-wider">{stat.label}</div>
              {stat.sub && <div className="mt-1">{stat.sub}</div>}
            </div>
          ))}
        </div>

        {/* ═══════════ ACHIEVEMENTS ═══════════ */}
        <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-[2rem] p-6 sm:p-8 shadow-xl">
          <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-yellow-500 mb-1 flex items-center gap-3">
            <Medal size={28} weight="duotone" className="text-yellow-400" />
            Achievements
          </h2>
          <p className="text-slate-500 text-xs font-medium mb-6">{profile.achievements.filter(a => a.unlocked).length} / {profile.achievements.length} unlocked</p>

          <div className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory hide-scrollbar">
            {profile.achievements.map(achievement => (
              <div
                key={achievement.id}
                className="relative snap-start shrink-0"
              >
                <button
                  onClick={() => setAchievementPopover(achievementPopover === achievement.id ? null : achievement.id)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all min-w-[80px] ${
                    achievement.unlocked
                      ? 'bg-slate-800/60 border-slate-700 hover:border-indigo-500/50 hover:-translate-y-1 cursor-pointer'
                      : 'bg-slate-900/40 border-slate-800/50 opacity-50 grayscale cursor-pointer'
                  }`}
                >
                  <span className="text-2xl">{achievement.icon}</span>
                  <span className={`text-[10px] font-bold text-center leading-tight ${achievement.unlocked ? 'text-slate-300' : 'text-slate-600'}`}>
                    {achievement.unlocked ? achievement.name : '???'}
                  </span>
                  {!achievement.unlocked && <Lock size={10} className="text-slate-600" />}
                </button>

                {/* Popover */}
                <AnimatePresence>
                  {achievementPopover === achievement.id && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-slate-800 border border-slate-700 rounded-xl p-3 shadow-2xl z-20 min-w-[180px]"
                    >
                      <div className="text-xs font-bold text-white mb-1">{achievement.name}</div>
                      <div className="text-[10px] text-slate-400">{achievement.description}</div>
                      {achievement.unlocked && <div className="text-[10px] text-emerald-400 font-bold mt-1">✓ Unlocked</div>}
                      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-800 border-l border-t border-slate-700 rotate-45"></div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>

        {/* ═══════════ HALL OF FAME / SHOWCASE ═══════════ */}
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

        {/* ═══════════ TOP DEVELOPERS ═══════════ */}
        <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-[2rem] p-8 sm:p-10 shadow-xl">
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 mb-2 flex items-center gap-3">
            Top Developers
          </h2>
          <p className="text-slate-500 text-xs font-medium mb-8 uppercase tracking-wider">Most battle-hardened cards in the collection</p>
          
          {profile.topCards.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 sm:gap-6">
              {profile.topCards.map((card, i) => {
                const tier = LOYALTY_TIER_LABELS[card.loyaltyTier || 'none'] || LOYALTY_TIER_LABELS['none'];
                const isEternal = card.loyaltyTier === 'eternal';
                return (
                  <div key={i} className={`relative pt-6 pb-4 px-3 rounded-2xl border flex flex-col items-center text-center transition-all hover:-translate-y-2 ${
                    isEternal 
                      ? 'bg-gradient-to-b from-pink-900/30 to-purple-900/10 border-pink-500/50 shadow-[0_10px_25px_-5px_rgba(236,72,153,0.3)] hover:shadow-[0_15px_35px_-5px_rgba(236,72,153,0.5)]'
                      : card.isShiny 
                        ? 'bg-gradient-to-b from-amber-900/40 to-yellow-900/10 border-yellow-500/50 shadow-[0_10px_25px_-5px_rgba(234,179,8,0.3)] hover:shadow-[0_15px_35px_-5px_rgba(234,179,8,0.5)]' 
                        : 'bg-slate-800/40 border-slate-700 hover:border-indigo-500/50 hover:shadow-[0_10px_25px_-5px_rgba(99,102,241,0.2)]'
                  }`}>
                    {/* Eternal holographic border animation */}
                    {isEternal && (
                      <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                        <div className="absolute inset-0 animate-spin-slow" style={{
                          background: 'conic-gradient(from 0deg, transparent, rgba(236,72,153,0.3), transparent, rgba(168,85,247,0.3), transparent)',
                          animationDuration: '4s',
                        }} />
                      </div>
                    )}
                    {card.isShiny && (
                      <div className="absolute top-0 right-0 m-2">
                        <span className="flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                        </span>
                      </div>
                    )}
                    <img src={card.avatarUrl || `https://github.com/${card.githubUsername}.png`} alt={card.name} className={`w-20 h-20 rounded-full mb-3 shadow-lg relative z-10 ${card.isShiny ? 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-slate-900' : ''}`} />
                    <div className="font-black text-sm line-clamp-1 mb-1 text-white relative z-10">{card.name}</div>
                    <div className="flex gap-2 text-[10px] font-bold bg-slate-950/50 px-3 py-1.5 rounded-lg border border-white/5 flex-wrap justify-center mb-2 relative z-10">
                      <span className="text-rose-400">⚔️ {card.atk}</span>
                      <span className="text-emerald-400">🛡️ {card.def}</span>
                    </div>
                    {/* Loyalty Tier Badge */}
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${tier.bg} ${tier.color} border border-current/20 relative z-10`}>
                      {tier.label}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 text-slate-500 bg-slate-800/20 rounded-[2rem] border-2 border-dashed border-slate-700/50 flex flex-col items-center">
              <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4 text-2xl text-slate-500">😔</div>
              <p className="font-bold text-lg">No collection yet.</p>
              <p className="text-sm mt-1">This user hasn't collected any developers.</p>
            </div>
          )}
        </div>

        {/* ═══════════ RECENT BATTLES ═══════════ */}
        {profile.recentBattles.length > 0 && (
          <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-[2rem] p-6 sm:p-8 shadow-xl">
            <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-orange-400 mb-1 flex items-center gap-3">
              <Sword size={24} weight="duotone" className="text-rose-400" />
              Recent Battles
            </h2>
            <p className="text-slate-500 text-xs font-medium mb-6">Last {profile.recentBattles.length} completed battles</p>

            <div className="space-y-2">
              {profile.recentBattles.map((battle) => {
                const league = LEAGUE_LABELS[battle.leagueMode] || LEAGUE_LABELS['OPEN'];
                const isExpanded = expandedBattle === battle.id;
                return (
                  <div key={battle.id} className="border border-slate-800 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedBattle(isExpanded ? null : battle.id)}
                      className="w-full flex items-center gap-3 p-3 sm:p-4 hover:bg-slate-800/30 transition-colors text-left"
                    >
                      <UserAvatar username={battle.opponentUsername} image={battle.opponentImage} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-white truncate">{battle.opponentUsername}</div>
                        <span className={`text-[10px] font-bold ${league.color}`}>{league.label}</span>
                      </div>
                      <div className={`px-3 py-1 rounded-lg text-xs font-black ${
                        battle.won ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                        {battle.won ? 'WIN' : 'LOSS'}
                      </div>
                      <div className="text-sm font-bold text-white tabular-nums w-12 text-center">
                        {battle.playerScore}–{battle.opponentScore}
                      </div>
                      <div className="text-[10px] text-slate-500 w-16 text-right hidden sm:block">
                        {new Date(battle.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      {isExpanded ? <CaretUp size={14} className="text-slate-500" /> : <CaretDown size={14} className="text-slate-500" />}
                    </button>

                    {/* Expanded battle details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4 pt-0 border-t border-slate-800/50">
                            <div className="grid grid-cols-2 gap-4 mt-3">
                              <div>
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Your Team</div>
                                {(battle.isChallenger ? battle.challengerTeam : battle.defenderTeam)?.map((c: any, idx: number) => (
                                  <div key={idx} className="flex items-center gap-2 py-1.5">
                                    <img src={c.avatarUrl || `https://github.com/${c.name}.png`} alt={c.name} className="w-6 h-6 rounded-full" />
                                    <span className="text-xs font-bold text-white truncate">{c.name}</span>
                                    <span className="text-[10px] text-slate-500 ml-auto">{c.atk}/{c.def}/{c.hp}</span>
                                  </div>
                                ))}
                              </div>
                              <div>
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Opponent Team</div>
                                {(battle.isChallenger ? battle.defenderTeam : battle.challengerTeam)?.map((c: any, idx: number) => (
                                  <div key={idx} className="flex items-center gap-2 py-1.5">
                                    <img src={c.avatarUrl || `https://github.com/${c.name}.png`} alt={c.name} className="w-6 h-6 rounded-full" />
                                    <span className="text-xs font-bold text-white truncate">{c.name}</span>
                                    <span className="text-[10px] text-slate-500 ml-auto">{c.atk}/{c.def}/{c.hp}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══════════ FRIENDS ═══════════ */}
        <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-[2rem] p-8 sm:p-10 shadow-xl">
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 mb-8 flex items-center gap-3">
            <Users size={28} weight="duotone" className="text-blue-400" />
            Friends
            <span className="px-3 py-1 bg-slate-800 text-xs text-slate-400 font-bold rounded-full uppercase tracking-widest border border-slate-700">
              {profile.friends.length}
            </span>
            {isOwnProfile && (
              <Link href="/friends" className="ml-auto text-sm font-bold text-indigo-400 hover:text-indigo-300 transition-colors px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 hover:border-indigo-500/40 hover:bg-indigo-500/15">
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
                  <div className="mb-3 group-hover:scale-110 transition-transform">
                    <UserAvatar username={friend.username} image={friend.image} size="lg" />
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

      {/* Edit Profile Modal */}
      {isOwnProfile && (
        <EditProfileModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          currentProfile={{
            username: profile.user.username,
            image: profile.user.image,
            bannerImage: profile.user.bannerImage,
            bio: profile.user.bio,
            preferredLanguage: profile.user.preferredLanguage,
            level: profile.user.level,
            rating: profile.user.rating,
          }}
          onSave={() => {
            fetchProfile();
            // Update session to reflect new avatar
            updateSession({ image: 'refresh' });
          }}
        />
      )}

      {/* Custom scrollbar CSS */}
      <style jsx global>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 4s linear infinite; }
      `}</style>
    </div>
  );
}
