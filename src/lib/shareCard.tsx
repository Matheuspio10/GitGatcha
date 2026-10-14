/**
 * Public share pages and images (/card/<login>, /u/<username>, the card PNG
 * for READMEs). Server only: reads the database. The images are drawn with
 * next/og (satori), which only understands inline styles and flexbox, so the
 * card here is a simplified version of Card.tsx.
 */
import { collectionProgress, frameById, publicFrame, publicTitle, titleById } from './collections';
import { prisma } from './prisma';
import { cardTitle, languageStyle, serialHash } from './cardVisuals';
import { SIGNATURE_EDITION } from './githubLink';
export { siteUrl } from './siteUrl';

export const RARITY_HEX: Record<string, string> = {
  Common: '#8b8fa3',
  Uncommon: '#3ddc97',
  Rare: '#4f8cff',
  Epic: '#b26bff',
  Legendary: '#ffc84a',
};

const SIGNATURE_GRADIENT = 'linear-gradient(135deg, #7C4DFF 0%, #FF4FA3 100%)';

export type ShareCard = NonNullable<Awaited<ReturnType<typeof getShareCard>>>;

/** A card by its developer's login, with the player who holds its Signature edition (if any). */
export async function getShareCard(login: string) {
  const card = await prisma.card.findFirst({ where: { githubUsername: { equals: login, mode: 'insensitive' } } });
  if (!card) return null;
  const signature = await prisma.userCard.findFirst({
    where: { cardId: card.id, edition: SIGNATURE_EDITION },
    select: { user: { select: { username: true } } },
  });
  const owners = await prisma.userCard.count({ where: { cardId: card.id } });
  const { title, reason } = cardTitle(card, card.primaryLanguage, card.rarity, card.githubUsername);
  return { ...card, title, titleReason: reason, signatureOwner: signature?.user.username ?? null, owners };
}

/** Avatar URL that satori can fetch (a sized PNG from GitHub). */
export function avatarFor(login: string, avatarUrl?: string | null, size = 240): string {
  if (avatarUrl) return avatarUrl.includes('?') ? `${avatarUrl}&s=${size}` : `${avatarUrl}?s=${size}`;
  return `https://github.com/${encodeURIComponent(login)}.png?size=${size}`;
}

/** The card face for images: 400×560 at scale 1. */
export function CardArt({ card, signature = false, scale = 1 }: { card: ShareCard; signature?: boolean; scale?: number }) {
  const s = (n: number) => n * scale;
  const color = RARITY_HEX[card.rarity] ?? RARITY_HEX.Common;
  const lang = languageStyle(card.primaryLanguage);
  const stat = (label: string, value: number, tint: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, padding: `${s(8)}px 0`, borderRadius: s(10), background: 'rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', fontSize: s(13), color: '#a3a0b8', letterSpacing: 1 }}>{label}</div>
      <div style={{ display: 'flex', fontSize: s(26), fontWeight: 700, color: tint }}>{value}</div>
    </div>
  );
  return (
    <div style={{
      display: 'flex', width: s(400), height: s(560), padding: s(6), borderRadius: s(22),
      background: signature ? SIGNATURE_GRADIENT : `linear-gradient(160deg, ${color} 0%, #1c1830 55%, ${color} 100%)`,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', borderRadius: s(17), background: '#141122', padding: s(18), color: '#f4f2ff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: s(15), fontWeight: 700, color, letterSpacing: 2 }}>{card.rarity.toUpperCase()}</div>
          <div style={{ display: 'flex', fontSize: s(14), padding: `${s(3)}px ${s(10)}px`, borderRadius: s(8), background: lang.color, color: lang.ink, fontWeight: 700 }}>{lang.abbr}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: s(16) }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarFor(card.githubUsername, card.avatarUrl)} width={s(190)} height={s(190)} alt="" style={{ borderRadius: s(18), border: `${s(3)}px solid ${color}` }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: s(16) }}>
          <div style={{ display: 'flex', fontSize: s(30), fontWeight: 700, textAlign: 'center', lineHeight: 1.1 }}>{card.name.length > 22 ? `${card.name.slice(0, 21)}…` : card.name}</div>
          <div style={{ display: 'flex', fontSize: s(16), color: '#a3a0b8', marginTop: s(4) }}>@{card.githubUsername}</div>
          <div style={{ display: 'flex', fontSize: s(17), color, marginTop: s(10), fontWeight: 700 }}>{card.title}</div>
        </div>
        <div style={{ display: 'flex', gap: s(10), marginTop: 'auto' }}>
          {stat('ATK', card.atk, '#ff7a7a')}
          {stat('DEF', card.def, '#7aa8ff')}
          {stat('HP', card.hp, '#3ddc97')}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: s(12), fontSize: s(13), color: '#6f6b88' }}>
          <div style={{ display: 'flex' }}>{signature ? 'SIGNATURE EDITION' : 'GITGACHA'}</div>
          <div style={{ display: 'flex' }}>#{serialHash(card.githubUsername)}</div>
        </div>
      </div>
    </div>
  );
}

/** Small "GitGacha" wordmark for the landscape images. */
export function Wordmark({ size = 34 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', fontSize: size, fontWeight: 800 }}>
      <span style={{ color: '#f4f2ff' }}>Git</span>
      <span style={{ color: '#FF4FA3' }}>Gacha</span>
    </div>
  );
}

const RARITY_RANK: Record<string, number> = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 };

/** Public summary of a player (no e-mail or private data): level, rating, collection, best cards. */
export async function getShareProfile(username: string) {
  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: {
      id: true, username: true, image: true, level: true, rating: true, createdAt: true, title: true, frame: true,
      cards: { select: { edition: true, isShiny: true, card: true } },
      seasonResults: { select: { seasonId: true, tier: true, peakRating: true }, orderBy: { seasonId: 'desc' }, take: 12 },
    },
  });
  if (!user?.username) return null;
  const byRarity = Object.fromEntries(Object.keys(RARITY_RANK).map(r => [r, 0])) as Record<string, number>;
  for (const uc of user.cards) byRarity[uc.card.rarity] = (byRarity[uc.card.rarity] ?? 0) + 1;
  const power = (c: { atk: number; def: number; hp: number }) => c.atk + c.def + c.hp;
  const ranked = [...user.cards].sort((a, b) =>
    (RARITY_RANK[b.card.rarity] ?? 0) - (RARITY_RANK[a.card.rarity] ?? 0) || power(b.card) - power(a.card));
  const withTitle = (uc: (typeof user.cards)[number]) => ({
    ...uc.card,
    edition: uc.edition,
    isShiny: uc.isShiny,
    title: cardTitle(uc.card, uc.card.primaryLanguage, uc.card.rarity, uc.card.githubUsername).title,
  });
  const signature = user.cards.find(uc => uc.edition === SIGNATURE_EDITION);
  return {
    username: user.username,
    image: user.image,
    level: user.level,
    rating: user.rating,
    joinedAt: user.createdAt,
    uniqueCards: user.cards.length,
    byRarity,
    topCards: ranked.filter(uc => uc.edition !== SIGNATURE_EDITION).slice(0, 6).map(withTitle),
    signatureCard: signature ? withTitle(signature) : null,
    seasons: user.seasonResults,
    title: publicTitle(titleById(user.title)),
    frame: publicFrame(frameById(user.frame)),
    setsCompleted: collectionProgress(user.cards.map(uc => uc.card)).filter(s => s.complete).length,
  };
}

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_BACKGROUND = 'radial-gradient(circle at 20% 20%, #2a1f55 0%, #0d0b18 60%)';
