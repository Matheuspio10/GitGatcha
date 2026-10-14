import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { CardArt, OG_BACKGROUND, OG_SIZE, RARITY_HEX, Wordmark, getShareCard } from '@/lib/shareCard';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'A developer card on GitGacha';

/** Link preview of a card page: the card plus who it is. */
export default async function Image({ params }: { params: Promise<{ login: string }> }) {
  const { login } = await params;
  const [card, t] = await Promise.all([getShareCard(decodeURIComponent(login)), getTranslations('public.card.og')]);
  if (!card) {
    return new ImageResponse(<div style={{ display: 'flex', width: '100%', height: '100%', background: OG_BACKGROUND, alignItems: 'center', justifyContent: 'center' }}><Wordmark size={80} /></div>, size);
  }
  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%', background: OG_BACKGROUND, padding: 60, gap: 60, alignItems: 'center' }}>
      <CardArt card={card} signature={!!card.signatureOwner} scale={0.9} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, color: '#f4f2ff' }}>
        <Wordmark />
        <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, marginTop: 30, lineHeight: 1.05 }}>{card.name}</div>
        <div style={{ display: 'flex', fontSize: 34, color: RARITY_HEX[card.rarity] ?? '#fff', marginTop: 12 }}>{card.rarity} · {card.title}</div>
        <div style={{ display: 'flex', fontSize: 28, color: '#a3a0b8', marginTop: 30 }}>
          {card.signatureOwner ? t('signatureHeld', { owner: card.signatureOwner }) : t('owners', { count: card.owners })}
        </div>
        <div style={{ display: 'flex', fontSize: 28, color: '#3ddc97', marginTop: 40 }}>{t('cta')}</div>
      </div>
    </div>,
    size,
  );
}
