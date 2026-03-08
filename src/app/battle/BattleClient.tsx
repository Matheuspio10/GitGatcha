'use client';

import { useState } from 'react';
import { Card, CardProps } from '@/components/Card';

export default function BattleClient({ userCards }: { userCards: CardProps[] }) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [opponentCard, setOpponentCard] = useState<CardProps | null>(null);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [winnerSide, setWinnerSide] = useState<string | null>(null);
  const [rewards, setRewards] = useState({ bits: 0, xp: 0 });
  const [loading, setLoading] = useState(false);

  const selectedCard = userCards.find(c => c.id === selectedCardId);

  const startBattle = async () => {
    if (!selectedCardId) return;
    setLoading(true);
    setBattleLog([]);
    setOpponentCard(null);
    setWinnerSide(null);
    setRewards({ bits: 0, xp: 0 });

    try {
      const res = await fetch('/api/battle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: selectedCardId })
      });
      const data = await res.json();
      
      if (data.success) {
        setOpponentCard(data.opponentCard);
        setWinnerSide(data.result.winnerSide);
        setRewards({ bits: data.rewardBits, xp: data.rewardXp });
        
        // Animate log appearing line by line
        data.result.log.forEach((line: string, idx: number) => {
          setTimeout(() => {
            setBattleLog(prev => [...prev, line]);
          }, idx * 800);
        });
      } else {
        alert(data.error);
      }
    } catch {
      alert("Battle failed to initiate.");
    } finally {
      setLoading(false);
    }
  };

  const resetBattle = () => {
    setOpponentCard(null);
    setBattleLog([]);
    setWinnerSide(null);
  };

  if (userCards.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400">
        You need cards to battle. Go to the store and open a booster!
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-12">
      <div className="text-center">
        <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500 mb-4 tracking-tighter">
          The Arena
        </h1>
        <p className="text-slate-400">Select a developer to forge into combat.</p>
      </div>

      {!opponentCard ? (
        <div className="flex flex-col items-center gap-8">
          <div className="flex gap-4 max-w-full overflow-x-auto pb-6 px-4 snap-x">
            {userCards.map(c => (
              <div 
                key={c.id} 
                onClick={() => setSelectedCardId(c.id || null)}
                className={`cursor-pointer snap-center transition-transform ${selectedCardId === c.id ? 'scale-105 ring-4 ring-red-500 rounded-xl' : 'hover:scale-105 grayscale opacity-70 hover:grayscale-0 hover:opacity-100'}`}
              >
                <Card {...c} disableLink />
              </div>
            ))}
          </div>
          <button
            onClick={startBattle}
            disabled={!selectedCardId || loading}
            className="px-12 py-4 bg-red-600 hover:bg-red-500 text-white font-bold text-xl rounded-2xl disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(220,38,38,0.5)]"
          >
            {loading ? 'Matchmaking...' : 'FIGHT'}
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="flex flex-col md:flex-row items-center justify-center gap-12 md:gap-24 w-full">
            <div className="flex flex-col items-center gap-4">
              <h2 className="text-2xl font-bold text-blue-400">YOU</h2>
              {selectedCard && <Card {...selectedCard} disableLink />}
            </div>
            
            <div className="text-6xl font-black text-slate-700 italic">VS</div>

            <div className="flex flex-col items-center gap-4">
              <h2 className="text-2xl font-bold text-red-500">OPPONENT</h2>
              {opponentCard && <Card {...opponentCard} />}
            </div>
          </div>

          <div className="mt-12 w-full max-w-2xl bg-black/60 border border-slate-800 rounded-xl p-6 font-mono text-sm h-64 overflow-y-auto hidden-scrollbar flex flex-col gap-2">
            {battleLog.length === 0 && <span className="text-slate-500 animate-pulse">Computing battle...</span>}
            {battleLog.map((log, i) => (
              <div key={i} className={`p-2 rounded ${log.includes('wins!') ? 'bg-indigo-900/50 text-indigo-300 font-bold text-lg text-center mt-4' : 'bg-slate-900/50 text-slate-300'}`}>
                {log}
              </div>
            ))}
            
            {winnerSide && battleLog.some(l => l.includes('wins!')) && (
              <div className="mt-6 text-center animate-fade-in space-y-4">
                <div className="inline-block px-6 py-3 bg-slate-800 rounded-lg border border-slate-700">
                  <span className="block text-xs uppercase text-slate-400 mb-1">Rewards</span>
                  <div className="flex gap-4 font-bold">
                    <span className="text-yellow-400">+{rewards.bits} Bits</span>
                    <span className="text-blue-400">+{rewards.xp} XP</span>
                  </div>
                </div>
                <div>
                  <button onClick={resetBattle} className="mt-4 px-8 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors">
                    FIGHT AGAIN
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
