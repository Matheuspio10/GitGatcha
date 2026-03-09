'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardProps } from '@/components/Card';
import { motion, AnimatePresence } from 'framer-motion';
import { Sword, Shield, Heart, Lightning, Trophy, Clock, Users, GameController, ArrowClockwise } from '@phosphor-icons/react';

type Attribute = 'ATK' | 'DEF' | 'HP';
type RoundResult = {
  roundNum: number;
  attribute: string;
  challengerValue: number;
  defenderValue: number;
  winner: 'CHALLENGER' | 'DEFENDER' | 'DRAW';
};

type BattleResult = {
  defenderCard: CardProps;
  winnerSide: 'CHALLENGER' | 'DEFENDER' | 'DRAW';
  rewards: { bits: number; xp: number };
  rounds: RoundResult[];
};

type Challenge = {
  id: string;
  challenger: { id: string; username: string; image?: string };
  challengerCard: { id: string; name: string; rarity: string };
  rounds: { attribute: string }[];
  createdAt: string;
  expiresAt: string;
};

type HistoryBattle = {
  id: string;
  challenger: { id: string; username: string };
  defender: { id: string; username: string } | null;
  challengerCard: CardProps;
  defenderCard: CardProps | null;
  winnerId: string;
  isRandom: boolean;
  completedAt: string;
  rounds: RoundResult[];
};

const ATTR_ICON: Record<string, React.ReactNode> = {
  ATK: <Sword size={20} weight="fill" className="text-red-400" />,
  DEF: <Shield size={20} weight="fill" className="text-blue-400" />,
  HP: <Heart size={20} weight="fill" className="text-green-400" />,
};

const ATTR_COLOR: Record<string, string> = {
  ATK: 'from-red-500/20 to-red-700/20 border-red-500/40',
  DEF: 'from-blue-500/20 to-blue-700/20 border-blue-500/40',
  HP: 'from-green-500/20 to-green-700/20 border-green-500/40',
};

const TABS = ['Quick Battle', 'Challenge', 'History'] as const;
type Tab = typeof TABS[number];

export default function BattleClient({ userCards, userId }: { userCards: CardProps[]; userId: string }) {
  const [tab, setTab] = useState<Tab>('Quick Battle');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null);
  const [currentRevealRound, setCurrentRevealRound] = useState(0);
  const [loading, setLoading] = useState(false);

  // Challenge state
  const [challengeUsername, setChallengeUsername] = useState('');
  const [challengeAttribute, setChallengeAttribute] = useState<Attribute>('ATK');
  const [challenges, setChallenges] = useState<{ incoming: Challenge[]; outgoing: Challenge[] }>({ incoming: [], outgoing: [] });
  const [respondingTo, setRespondingTo] = useState<Challenge | null>(null);
  const [respondAttribute, setRespondAttribute] = useState<Attribute>('ATK');
  const [respondCardId, setRespondCardId] = useState<string | null>(null);

  // History state
  const [history, setHistory] = useState<HistoryBattle[]>([]);
  const [expandedBattle, setExpandedBattle] = useState<string | null>(null);

  const selectedCard = userCards.find(c => c.id === selectedCardId);

  const fetchChallenges = useCallback(async () => {
    try {
      const res = await fetch('/api/battle/challenge');
      const data = await res.json();
      setChallenges({ incoming: data.incoming || [], outgoing: data.outgoing || [] });
    } catch { /* silent */ }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/battle/history?limit=20');
      const data = await res.json();
      setHistory(data.battles || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (tab === 'Challenge') fetchChallenges();
    if (tab === 'History') fetchHistory();
  }, [tab, fetchChallenges, fetchHistory]);

  // Animated round reveal for battle results
  useEffect(() => {
    if (!battleResult) return;
    setCurrentRevealRound(0);
    const timers: NodeJS.Timeout[] = [];
    battleResult.rounds.forEach((_, i) => {
      timers.push(setTimeout(() => setCurrentRevealRound(i + 1), (i + 1) * 1500));
    });
    return () => timers.forEach(clearTimeout);
  }, [battleResult]);

  const startRandomBattle = async () => {
    if (!selectedCardId) return;
    setLoading(true);
    setBattleResult(null);
    try {
      const res = await fetch('/api/battle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: selectedCardId })
      });
      const data = await res.json();
      if (data.success) {
        setBattleResult({
          defenderCard: data.defenderCard,
          winnerSide: data.winnerSide,
          rewards: data.rewards,
          rounds: data.rounds,
        });
      } else {
        alert(data.error);
      }
    } catch {
      alert('Battle failed to initiate.');
    } finally {
      setLoading(false);
    }
  };

  const sendChallenge = async () => {
    if (!selectedCardId || !challengeUsername) return;
    setLoading(true);
    try {
      const res = await fetch('/api/battle/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defenderUsername: challengeUsername, cardId: selectedCardId, attribute: challengeAttribute })
      });
      const data = await res.json();
      if (data.success) {
        setChallengeUsername('');
        setSelectedCardId(null);
        fetchChallenges();
        alert('Challenge sent!');
      } else {
        alert(data.error);
      }
    } catch {
      alert('Failed to send challenge.');
    } finally {
      setLoading(false);
    }
  };

  const respondToChallenge = async () => {
    if (!respondingTo || !respondCardId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/battle/challenge/${respondingTo.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: respondCardId, attribute: respondAttribute })
      });
      const data = await res.json();
      if (data.success) {
        setRespondingTo(null);
        setRespondCardId(null);
        setBattleResult({
          defenderCard: data.battle.challengerCard,
          winnerSide: data.winnerSide === 'DEFENDER' ? 'CHALLENGER' : data.winnerSide === 'CHALLENGER' ? 'DEFENDER' : 'DRAW',
          rewards: data.defenderRewards,
          rounds: data.rounds,
        });
        setTab('Quick Battle');
        fetchChallenges();
      } else {
        alert(data.error);
      }
    } catch {
      alert('Failed to respond to challenge.');
    } finally {
      setLoading(false);
    }
  };

  const resetBattle = () => {
    setBattleResult(null);
    setCurrentRevealRound(0);
    setSelectedCardId(null);
  };

  if (userCards.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400">
        <GameController size={64} className="mx-auto mb-4 opacity-50" />
        <p className="text-xl">You need cards to battle.</p>
        <p className="text-sm mt-2">Go to the Gacha and open a booster!</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 mb-2 tracking-tighter">
          The Arena
        </h1>
        <p className="text-slate-400">Select a card. Choose your strategy. Claim victory.</p>
      </div>

      {/* Tabs */}
      <div className="flex justify-center gap-2">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setBattleResult(null); }}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
              tab === t
                ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.3)]'
                : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            {t === 'Quick Battle' && <Lightning size={16} weight="fill" className="inline mr-1.5 -mt-0.5" />}
            {t === 'Challenge' && <Users size={16} weight="fill" className="inline mr-1.5 -mt-0.5" />}
            {t === 'History' && <Clock size={16} weight="fill" className="inline mr-1.5 -mt-0.5" />}
            {t}
            {t === 'Challenge' && challenges.incoming.length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {challenges.incoming.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Battle Result Overlay */}
      <AnimatePresence>
        {battleResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-8"
          >
            {/* Cards face off */}
            <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-20">
              <motion.div
                initial={{ x: -100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col items-center gap-3"
              >
                <span className="text-sm font-bold uppercase tracking-widest text-blue-400">You</span>
                {selectedCard && <Card {...selectedCard} disableLink />}
              </motion.div>

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: 'spring' }}
                className="text-5xl font-black text-slate-600 italic"
              >
                VS
              </motion.div>

              <motion.div
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col items-center gap-3"
              >
                <span className="text-sm font-bold uppercase tracking-widest text-red-400">Opponent</span>
                <Card {...battleResult.defenderCard} disableLink />
              </motion.div>
            </div>

            {/* Round-by-round results */}
            <div className="max-w-2xl mx-auto space-y-4">
              {battleResult.rounds.map((round, i) => (
                <AnimatePresence key={round.roundNum}>
                  {currentRevealRound > i && (
                    <motion.div
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.4 }}
                      className={`relative overflow-hidden rounded-xl border bg-gradient-to-r ${ATTR_COLOR[round.attribute]} p-4`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Round {round.roundNum}</span>
                          <div className="flex items-center gap-1.5">
                            {ATTR_ICON[round.attribute]}
                            <span className="font-bold text-white text-sm">{round.attribute}</span>
                          </div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                          round.winner === 'CHALLENGER' ? 'bg-blue-500/30 text-blue-300' :
                          round.winner === 'DEFENDER' ? 'bg-red-500/30 text-red-300' :
                          'bg-yellow-500/30 text-yellow-300'
                        }`}>
                          {round.winner === 'CHALLENGER' ? 'YOU WIN' : round.winner === 'DEFENDER' ? 'OPPONENT WINS' : 'DRAW'}
                        </div>
                      </div>
                      <div className="flex items-center justify-center gap-8 mt-3">
                        <div className={`text-center ${round.winner === 'CHALLENGER' ? 'text-blue-300' : 'text-slate-400'}`}>
                          <span className="text-3xl font-black">{round.challengerValue}</span>
                          <p className="text-[10px] uppercase tracking-wider mt-1">Your Card</p>
                        </div>
                        <span className="text-slate-600 font-bold text-xl">vs</span>
                        <div className={`text-center ${round.winner === 'DEFENDER' ? 'text-red-300' : 'text-slate-400'}`}>
                          <span className="text-3xl font-black">{round.defenderValue}</span>
                          <p className="text-[10px] uppercase tracking-wider mt-1">Opponent</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              ))}

              {/* Final result */}
              <AnimatePresence>
                {currentRevealRound >= battleResult.rounds.length && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3, type: 'spring' }}
                    className="text-center space-y-4 mt-6"
                  >
                    <div className={`inline-block px-8 py-4 rounded-2xl border ${
                      battleResult.winnerSide === 'CHALLENGER'
                        ? 'bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 border-yellow-500/30'
                        : battleResult.winnerSide === 'DRAW'
                        ? 'bg-gradient-to-r from-slate-500/10 to-slate-600/10 border-slate-500/30'
                        : 'bg-gradient-to-r from-red-500/10 to-red-600/10 border-red-500/30'
                    }`}>
                      {battleResult.winnerSide === 'CHALLENGER' && (
                        <Trophy size={48} weight="fill" className="text-yellow-400 mx-auto mb-2" />
                      )}
                      <h2 className={`text-3xl font-black ${
                        battleResult.winnerSide === 'CHALLENGER' ? 'text-yellow-400' :
                        battleResult.winnerSide === 'DRAW' ? 'text-slate-400' : 'text-red-400'
                      }`}>
                        {battleResult.winnerSide === 'CHALLENGER' ? 'VICTORY!' :
                         battleResult.winnerSide === 'DRAW' ? 'DRAW' : 'DEFEAT'}
                      </h2>
                      <div className="flex gap-6 mt-3 justify-center">
                        <div className="text-center">
                          <span className="text-yellow-400 font-bold text-lg">+{battleResult.rewards.bits}</span>
                          <p className="text-[10px] uppercase text-slate-400 tracking-wider">Bits</p>
                        </div>
                        <div className="text-center">
                          <span className="text-blue-400 font-bold text-lg">+{battleResult.rewards.xp}</span>
                          <p className="text-[10px] uppercase text-slate-400 tracking-wider">XP</p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <button
                        onClick={resetBattle}
                        className="px-8 py-3 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(220,38,38,0.3)] flex items-center gap-2 mx-auto"
                      >
                        <ArrowClockwise size={18} weight="bold" />
                        FIGHT AGAIN
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab Content (hidden when battle result is showing) */}
      {!battleResult && (
        <>
          {/* QUICK BATTLE TAB */}
          {tab === 'Quick Battle' && (
            <div className="flex flex-col items-center gap-8">
              <p className="text-slate-500 text-sm">Select a card and face a random opponent. All 3 rounds resolve instantly.</p>

              {/* Card Selection */}
              <div className="flex gap-4 max-w-full overflow-x-auto pb-6 px-4 snap-x">
                {userCards.map(c => (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCardId(c.id || null)}
                    className={`cursor-pointer snap-center transition-all duration-200 flex-shrink-0 ${
                      selectedCardId === c.id
                        ? 'scale-105 ring-4 ring-red-500 rounded-xl'
                        : 'hover:scale-105 grayscale opacity-60 hover:grayscale-0 hover:opacity-100'
                    }`}
                  >
                    <Card {...c} disableLink />
                  </div>
                ))}
              </div>

              <button
                onClick={startRandomBattle}
                disabled={!selectedCardId || loading}
                className="px-12 py-4 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-bold text-xl rounded-2xl disabled:opacity-50 transition-all shadow-[0_0_25px_rgba(220,38,38,0.4)] flex items-center gap-3"
              >
                <Lightning size={24} weight="fill" />
                {loading ? 'Matchmaking...' : 'QUICK BATTLE'}
              </button>
            </div>
          )}

          {/* CHALLENGE TAB */}
          {tab === 'Challenge' && !respondingTo && (
            <div className="space-y-10">
              {/* Create Challenge */}
              <div className="max-w-xl mx-auto bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Sword size={22} className="text-red-400" />
                  Send a Challenge
                </h2>
                <div>
                  <label className="text-xs uppercase tracking-wider text-slate-400 block mb-2">Opponent&apos;s Username</label>
                  <input
                    type="text"
                    value={challengeUsername}
                    onChange={e => setChallengeUsername(e.target.value)}
                    placeholder="Enter username..."
                    className="w-full bg-black/40 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-red-500/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-slate-400 block mb-2">Round 1 Attribute</label>
                  <div className="flex gap-3">
                    {(['ATK', 'DEF', 'HP'] as Attribute[]).map(attr => (
                      <button
                        key={attr}
                        onClick={() => setChallengeAttribute(attr)}
                        className={`flex-1 py-3 rounded-xl font-bold text-sm border transition-all flex items-center justify-center gap-2 ${
                          challengeAttribute === attr
                            ? `bg-gradient-to-r ${ATTR_COLOR[attr]} text-white`
                            : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                        }`}
                      >
                        {ATTR_ICON[attr]} {attr}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-slate-500 -mt-2">Select a card below and pick the attribute for round 1.</p>
                <div className="flex gap-3 overflow-x-auto pb-4 snap-x">
                  {userCards.map(c => (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCardId(c.id || null)}
                      className={`cursor-pointer snap-center transition-all duration-200 flex-shrink-0 ${
                        selectedCardId === c.id
                          ? 'scale-100 ring-4 ring-orange-500 rounded-xl'
                          : 'scale-90 hover:scale-95 grayscale opacity-50 hover:grayscale-0 hover:opacity-100'
                      }`}
                    >
                      <Card {...c} disableLink />
                    </div>
                  ))}
                </div>
                <button
                  onClick={sendChallenge}
                  disabled={!selectedCardId || !challengeUsername || loading}
                  className="w-full py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white rounded-xl font-bold disabled:opacity-50 transition-all"
                >
                  {loading ? 'Sending...' : 'Send Challenge'}
                </button>
              </div>

              {/* Incoming Challenges */}
              {challenges.incoming.length > 0 && (
                <div className="max-w-xl mx-auto space-y-4">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Lightning size={20} className="text-yellow-400" />
                    Incoming Challenges
                  </h2>
                  {challenges.incoming.map(c => (
                    <div key={c.id} className="bg-slate-900/60 border border-yellow-500/20 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-white">{c.challenger?.username || 'Unknown'}</p>
                        <p className="text-xs text-slate-400">
                          Round 1 Attribute: <span className="text-white font-bold">{c.rounds[0]?.attribute}</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Expires {new Date(c.expiresAt).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => { setRespondingTo(c); setRespondCardId(null); }}
                        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-bold text-sm transition-colors"
                      >
                        Accept
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Outgoing Challenges */}
              {challenges.outgoing.length > 0 && (
                <div className="max-w-xl mx-auto space-y-4">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Clock size={20} className="text-slate-400" />
                    Sent Challenges (Waiting...)
                  </h2>
                  {challenges.outgoing.map(c => (
                    <div key={c.id} className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
                      <p className="font-bold text-white">vs {(c as unknown as { defender?: { username?: string } }).defender?.username || 'Unknown'}</p>
                      <p className="text-xs text-slate-400">
                        Round 1: <span className="font-bold text-white">{c.rounds[0]?.attribute}</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Respond to challenge */}
          {tab === 'Challenge' && respondingTo && (
            <div className="max-w-xl mx-auto bg-slate-900/60 border border-yellow-500/20 rounded-2xl p-6 space-y-6">
              <h2 className="text-xl font-bold text-white">
                Respond to {respondingTo.challenger?.username}&apos;s Challenge
              </h2>
              <p className="text-sm text-slate-400">
                Round 1 attribute is <span className="text-white font-bold">{respondingTo.rounds[0]?.attribute}</span>. Pick your card and choose the attribute for Round 2.
              </p>

              <div>
                <label className="text-xs uppercase tracking-wider text-slate-400 block mb-2">Your Round 2 Attribute</label>
                <div className="flex gap-3">
                  {(['ATK', 'DEF', 'HP'] as Attribute[]).map(attr => (
                    <button
                      key={attr}
                      onClick={() => setRespondAttribute(attr)}
                      className={`flex-1 py-3 rounded-xl font-bold text-sm border transition-all flex items-center justify-center gap-2 ${
                        respondAttribute === attr
                          ? `bg-gradient-to-r ${ATTR_COLOR[attr]} text-white`
                          : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                      }`}
                    >
                      {ATTR_ICON[attr]} {attr}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-4 snap-x">
                {userCards.map(c => (
                  <div
                    key={c.id}
                    onClick={() => setRespondCardId(c.id || null)}
                    className={`cursor-pointer snap-center transition-all duration-200 flex-shrink-0 ${
                      respondCardId === c.id
                        ? 'scale-100 ring-4 ring-yellow-500 rounded-xl'
                        : 'scale-90 hover:scale-95 grayscale opacity-50 hover:grayscale-0 hover:opacity-100'
                    }`}
                  >
                    <Card {...c} disableLink />
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setRespondingTo(null); setRespondCardId(null); }}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={respondToChallenge}
                  disabled={!respondCardId || loading}
                  className="flex-1 py-3 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white rounded-xl font-bold disabled:opacity-50 transition-all"
                >
                  {loading ? 'Fighting...' : 'Accept & Fight'}
                </button>
              </div>
            </div>
          )}

          {/* HISTORY TAB */}
          {tab === 'History' && (
            <div className="max-w-3xl mx-auto space-y-4">
              {history.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <Clock size={48} className="mx-auto mb-4 opacity-40" />
                  <p>No battles yet. Start your first fight!</p>
                </div>
              ) : (
                history.map(battle => {
                  const isChallenger = battle.challenger?.id === userId;
                  const didWin = battle.winnerId === userId;
                  const opponentName = isChallenger
                    ? (battle.defender?.username || 'Random Opponent')
                    : (battle.challenger?.username || '???');

                  return (
                    <div key={battle.id}>
                      <button
                        onClick={() => setExpandedBattle(expandedBattle === battle.id ? null : battle.id)}
                        className={`w-full text-left bg-slate-900/60 border rounded-xl p-4 transition-all hover:bg-slate-800/60 ${
                          didWin ? 'border-green-500/20' : 'border-red-500/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${didWin ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="font-bold text-white">
                              {didWin ? 'Victory' : 'Defeat'} vs {opponentName}
                            </span>
                            {battle.isRandom && (
                              <span className="text-[10px] uppercase bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">Random</span>
                            )}
                          </div>
                          <span className="text-xs text-slate-500">
                            {new Date(battle.completedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </button>

                      {/* Expanded details */}
                      <AnimatePresence>
                        {expandedBattle === battle.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="bg-black/30 border border-slate-800 border-t-0 rounded-b-xl p-4 space-y-3">
                              {battle.rounds.map(round => (
                                <div key={round.roundNum} className="flex items-center justify-between bg-slate-900/40 rounded-lg p-3">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500 font-bold">R{round.roundNum}</span>
                                    {ATTR_ICON[round.attribute]}
                                    <span className="text-sm font-bold text-white">{round.attribute}</span>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm">
                                    <span className={`font-bold ${
                                      (isChallenger && round.winner === 'CHALLENGER') || (!isChallenger && round.winner === 'DEFENDER')
                                        ? 'text-green-400' : 'text-slate-400'
                                    }`}>
                                      {isChallenger ? round.challengerValue : round.defenderValue}
                                    </span>
                                    <span className="text-slate-600">vs</span>
                                    <span className={`font-bold ${
                                      (isChallenger && round.winner === 'DEFENDER') || (!isChallenger && round.winner === 'CHALLENGER')
                                        ? 'text-red-400' : 'text-slate-400'
                                    }`}>
                                      {isChallenger ? round.defenderValue : round.challengerValue}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
