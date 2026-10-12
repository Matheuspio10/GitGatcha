import { notFound } from 'next/navigation';
import { CardGallery } from './CardGallery';

/** Dev-only gallery of every card look (rarities, editions, states). Not served in production. */
export default function DevCardsPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <CardGallery />;
}
