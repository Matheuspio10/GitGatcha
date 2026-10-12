'use client';

import { useEffect, useState } from 'react';

import { Card, CardProps } from '@/components/Card';
import { BoosterReveal, CardBack, PackArt } from '@/components/BoosterReveal';

const avatar = (login: string) => `https://github.com/${login}.png?size=400`;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

const base = (login: string, name: string, rarity: string, primaryLanguage: string, atk: number, def: number, hp: number, flavorText: string): CardProps => ({
  name, githubUsername: login, avatarUrl: avatar(login), rarity, primaryLanguage, atk, def, hp, flavorText, disableLink: true,
});

// Illustrative GitHub profile snapshots (they drive the card title)
const since = (year: number) => new Date(Date.UTC(year, 0, 1));
const RARITIES: CardProps[] = [
  { ...base('octocat', 'The Octocat', 'Common', 'Ruby', 38, 31, 120, 'Hello World, again and forever.'), followers: 40, totalStars: 30, totalForks: 5, topRepoStars: 20, publicRepos: 8, publicGists: 8, languageCount: 3, githubCreatedAt: since(2011) },
  { ...base('mitchellh', 'Mitchell Hashimoto', 'Uncommon', 'Go', 54, 44, 150, 'Provisioned the server before coffee.'), followers: 160, totalStars: 90, totalForks: 20, topRepoStars: 40, publicRepos: 120, publicGists: 4, languageCount: 5, githubCreatedAt: since(2019) },
  { ...base('yyx990803', 'Evan You', 'Rare', 'TypeScript', 72, 58, 190, 'Reactive even when resting.'), followers: 600, totalStars: 2_600, totalForks: 300, topRepoStars: 2_400, publicRepos: 30, publicGists: 2, languageCount: 4, githubCreatedAt: since(2017) },
  { ...base('gaearon', 'Dan Abramov', 'Epic', 'JavaScript', 95, 70, 240, 'Dispatch, reduce, repeat.'), followers: 3_200, totalStars: 14_000, totalForks: 1_800, topRepoStars: 6_000, publicRepos: 90, publicGists: 20, languageCount: 6, githubCreatedAt: since(2013) },
  { ...base('torvalds', 'Linus Torvalds', 'Legendary', 'C', 131, 96, 320, 'Talk is cheap. Show me the code.'), followers: 280_000, totalStars: 210_000, totalForks: 60_000, topRepoStars: 190_000, publicRepos: 8, publicGists: 0, languageCount: 3, githubCreatedAt: since(2011) },
];

const EDITIONS: CardProps[] = [
  { ...base('ThePrimeagen', 'ThePrimeagen', 'Rare', 'Rust', 76, 61, 196, 'Rewrote it in Rust. It got faster.'), isShiny: true, quantity: 3 },
  { ...base('Matheuspio10', 'Matheuspio10', 'Rare', 'TypeScript', 70, 57, 186, 'git commit -m "built my own gacha"'), edition: 'signature' },
  { ...base('nonexistent-avatar-user', 'No Avatar', 'Uncommon', 'Haskell', 44, 40, 140, 'Neutral language, missing avatar.'), avatarUrl: '' },
];

const STATES: CardProps[] = [
  { ...base('sindresorhus', 'Sindre Sorhus', 'Epic', 'JavaScript', 92, 74, 236, 'One more npm package.'), stamina: 100, lastUsedAt: new Date(), inActiveTeam: true, loyaltyTier: 'trusted' },
  { ...base('kentcdodds', 'Kent C. Dodds', 'Rare', 'TypeScript', 70, 60, 188, 'Write tests. Not too many.'), stamina: 45, lastUsedAt: new Date(), inActiveTeam: true },
  { ...base('tj', 'TJ Holowaychuk', 'Legendary', 'Go', 120, 90, 300, 'Shipped another framework overnight.'), stamina: 0, lastUsedAt: hoursAgo(0), inActiveTeam: true },
  { ...base('antirez', 'antirez', 'Epic', 'C', 98, 72, 250, 'In-memory, in-mind.'), loyaltyTier: 'eternal' },
  { ...base('defunkt', 'Chris Wanstrath', 'Rare', 'Ruby', 74, 59, 192, 'Started it all with a hub.'), loyaltyTier: 'legendary_bond' },
];

function Row({ title, cards }: { title: string; cards: CardProps[] }) {
  return (
    <section className="mb-14">
      <h2 className="font-display text-xl font-extrabold mb-5">{title}</h2>
      <div className="flex flex-wrap gap-5">
        {cards.map((c) => <Card key={c.githubUsername + c.rarity} {...c} />)}
      </div>
    </section>
  );
}

function TestBooster() {
  const [run, setRun] = useState(0);
  const [best, setBest] = useState<'Rare' | 'Epic' | 'Legendary'>('Legendary');

  // ?autoplay=Epic opens a test pack and rips it after 600 ms (frame-by-frame checks with headless Chrome)
  useEffect(() => {
    const auto = new URLSearchParams(window.location.search).get('autoplay');
    if (auto !== 'Rare' && auto !== 'Epic' && auto !== 'Legendary') return;
    const open = setTimeout(() => {
      setBest(auto);
      setRun(1);
    }, 0);
    const rip = setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })), 600);
    return () => {
      clearTimeout(open);
      clearTimeout(rip);
    };
  }, []);
  const cards = [...RARITIES.slice(0, 3), RARITIES.find(c => c.rarity === best) ?? RARITIES[4], RARITIES[1]];
  return (
    <section className="mb-14">
      <h2 className="font-display text-xl font-extrabold mb-3">Test booster (no BITS, nothing saved)</h2>
      <div className="flex flex-wrap gap-2 mb-5">
        {(['Rare', 'Epic', 'Legendary'] as const).map(r => (
          <button key={r} onClick={() => { setBest(r); setRun(n => n + 1); }} className="px-4 py-2 rounded-full bg-slate-800 border border-slate-600 text-sm font-bold">
            Open a pack with a {r}
          </button>
        ))}
      </div>
      {run > 0 && (
        <BoosterReveal
          key={run}
          cards={cards.map(c => ({ ...c, isDuplicate: false }))}
          packDropFragments={null}
          packName="Test Pack"
          onComplete={() => setRun(0)}
        />
      )}
    </section>
  );
}

export function CardGallery() {
  return (
    <div>
      <p className="font-mono text-xs text-commit mb-2">DEV ONLY · /dev/cards</p>
      <h1 className="font-display text-3xl font-extrabold mb-10">Card gallery</h1>
      <TestBooster />
      <Row title="Rarities" cards={RARITIES} />
      <Row title="Shiny, Signature, Neutral without avatar" cards={EDITIONS} />
      <Row title="States: stamina, fatigue, exhausted, loyalty" cards={STATES} />
      <section className="mb-14">
        <h2 className="font-display text-xl font-extrabold mb-5">Booster: card back (idle, Epic and Legendary suspense) and pack</h2>
        <div className="flex flex-wrap gap-5">
          <div className="relative w-64 h-[410px]"><CardBack suspense={null} /></div>
          <div className="relative w-64 h-[410px]"><CardBack suspense="Epic" /></div>
          <div className="relative w-64 h-[410px]"><CardBack suspense="Legendary" /></div>
          <div className="relative w-[17rem] h-[27rem] overflow-hidden"><PackArt name="Open Source" cardCount={5} /></div>
        </div>
      </section>
    </div>
  );
}
