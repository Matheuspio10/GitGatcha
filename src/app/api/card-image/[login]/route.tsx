import { ImageResponse } from 'next/og';
import { CardArt, getShareCard, localizeShareCard } from '@/lib/shareCard';
import { getGameText } from '@/i18n/gameText.server';

/**
 * The card as a PNG (400×560), e.g. for a GitHub README:
 * /api/card-image/<login>?edition=signature
 * The Signature edition only renders when a player really holds it.
 */
export async function GET(req: Request, { params }: { params: Promise<{ login: string }> }) {
  const { login } = await params;
  const [found, game] = await Promise.all([getShareCard(decodeURIComponent(login)), getGameText('game')]);
  if (!found) return new Response('Card not found', { status: 404 });
  const card = localizeShareCard(found, game);
  const signature = new URL(req.url).searchParams.get('edition') === 'signature' && !!card.signatureOwner;
  return new ImageResponse(<CardArt card={card} signature={signature} />, {
    width: 400,
    height: 560,
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
  });
}
