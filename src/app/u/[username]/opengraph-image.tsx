import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { OG_BACKGROUND, OG_SIZE, RARITY_HEX, Wordmark, avatarFor, getShareProfile } from '@/lib/shareCard';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'A player collection on GitGacha';

/** Link preview of a player: stats and their three best cards. */
export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const [profile, t] = await Promise.all([getShareProfile(decodeURIComponent(username)), getTranslations('public.player.og')]);
  if (!profile) {
    return new ImageResponse(
      <div style={{ display: 'flex', width: '100%', height: '100%', background: OG_BACKGROUND, alignItems: 'center', justifyContent: 'center' }}><Wordmark size={80} /></div>,
      size,
    );
  }
  const best = [profile.signatureCard, ...profile.topCards].filter(c => !!c).slice(0, 3);
  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: OG_BACKGROUND, padding: 60, color: '#f4f2ff' }}>
      <Wordmark />
      <div style={{ display: 'flex', fontSize: 72, fontWeight: 800, marginTop: 24 }}>{profile.username}</div>
      <div style={{ display: 'flex', fontSize: 32, color: '#a3a0b8', marginTop: 8 }}>
        {t('stats', { level: profile.level, count: profile.uniqueCards, rating: profile.rating })}
      </div>
      <div style={{ display: 'flex', gap: 28, marginTop: 'auto' }}>
        {best.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 14, borderRadius: 18, background: 'rgba(255,255,255,0.06)', border: `3px solid ${c.edition === 'signature' ? '#FF4FA3' : RARITY_HEX[c.rarity] ?? '#888'}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatarFor(c.githubUsername, c.avatarUrl, 120)} width={84} height={84} alt="" style={{ borderRadius: 14 }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontSize: 26, fontWeight: 700 }}>{c.name.length > 16 ? `${c.name.slice(0, 15)}…` : c.name}</div>
              <div style={{ display: 'flex', fontSize: 20, color: RARITY_HEX[c.rarity] ?? '#fff' }}>{c.edition === 'signature' ? t('signature') : c.rarity}</div>
            </div>
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}
