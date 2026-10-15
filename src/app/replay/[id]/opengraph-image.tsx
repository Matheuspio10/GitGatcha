import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { OG_BACKGROUND, OG_SIZE, RARITY_HEX, Wordmark, avatarFor } from '@/lib/shareCard';
import type { ReplayCard } from '@/lib/battleReplay';
import { loadReplay, replayLabels } from './replayView';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'A battle replay on GitGacha';

function Team({ name, cards, won, wonLabel }: { name: string; cards: ReplayCard[]; won: boolean; wonLabel: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, flex: 1 }}>
      <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, color: won ? '#fde047' : '#f4f2ff' }}>{name.length > 18 ? `${name.slice(0, 17)}…` : name}</div>
      <div style={{ display: 'flex', gap: 14 }}>
        {cards.slice(0, 3).map(c => c.avatarUrl ? (
          <img key={c.id} src={avatarFor(c.name, c.avatarUrl, 120)} width={96} height={96} alt="" style={{ borderRadius: 16, border: `4px solid ${RARITY_HEX[c.rarity] ?? '#888'}`, opacity: won ? 1 : 0.7 }} />
        ) : (
          <div key={c.id} style={{ display: 'flex', width: 96, height: 96, borderRadius: 16, border: `4px solid ${RARITY_HEX[c.rarity] ?? '#888'}`, background: '#1e1b2e' }} />
        ))}
      </div>
      <div style={{ display: 'flex', height: 36, fontSize: 26, fontWeight: 700, color: '#fde047' }}>{won ? wonLabel : ''}</div>
    </div>
  );
}

/** Link preview of a replay: both teams, the winner highlighted. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [replay, t] = await Promise.all([loadReplay(id), getTranslations('public.replay')]);
  if (!replay) {
    return new ImageResponse(
      <div style={{ display: 'flex', width: '100%', height: '100%', background: OG_BACKGROUND, alignItems: 'center', justifyContent: 'center' }}><Wordmark size={80} /></div>,
      size,
    );
  }
  const { challengerName, defenderName, winnerName, league } = await replayLabels(replay);
  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: OG_BACKGROUND, padding: 60, color: '#f4f2ff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Wordmark />
        <div style={{ display: 'flex', fontSize: 28, color: '#fb923c', fontWeight: 700 }}>{league}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 'auto', marginBottom: 'auto' }}>
        <Team name={challengerName} cards={replay.challengerTeam} won={replay.winnerSide === 'CHALLENGER'} wonLabel={t('og.won', { name: winnerName })} />
        <div style={{ display: 'flex', fontSize: 64, fontWeight: 900, color: '#f97316', padding: '0 24px' }}>VS</div>
        <Team name={defenderName} cards={replay.defenderTeam} won={replay.winnerSide === 'DEFENDER'} wonLabel={t('og.won', { name: winnerName })} />
      </div>
    </div>,
    size,
  );
}
