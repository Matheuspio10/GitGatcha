'use client';

import { Card, CardProps } from '@/components/Card';
import { CardBack, PackArt } from '@/components/BoosterReveal';

const avatar = (login: string) => `https://github.com/${login}.png?size=400`;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

const base = (login: string, name: string, rarity: string, primaryLanguage: string, atk: number, def: number, hp: number, flavorText: string): CardProps => ({
  name, githubUsername: login, avatarUrl: avatar(login), rarity, primaryLanguage, atk, def, hp, flavorText, disableLink: true,
});

const RARITIES: CardProps[] = [
  base('octocat', 'The Octocat', 'Common', 'Ruby', 38, 31, 120, 'Hello World, again and forever.'),
  base('mitchellh', 'Mitchell Hashimoto', 'Uncommon', 'Go', 54, 44, 150, 'Provisioned the server before coffee.'),
  base('yyx990803', 'Evan You', 'Rare', 'TypeScript', 72, 58, 190, 'Reactive even when resting.'),
  base('gaearon', 'Dan Abramov', 'Epic', 'JavaScript', 95, 70, 240, 'Dispatch, reduce, repeat.'),
  base('torvalds', 'Linus Torvalds', 'Legendary', 'C', 131, 96, 320, 'Talk is cheap. Show me the code.'),
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

export function CardGallery() {
  return (
    <div>
      <p className="font-mono text-xs text-commit mb-2">DEV ONLY · /dev/cards</p>
      <h1 className="font-display text-3xl font-extrabold mb-10">Card gallery</h1>
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
