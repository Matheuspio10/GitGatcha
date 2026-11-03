import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/session';
import { RemoveCardClient } from './RemoveCardClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('public.devRemoval');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

/** Public page where a developer with a card leaves the game (devRemovalService.ts). */
export default async function RemoveMyCardPage() {
  const [user, t] = await Promise.all([getCurrentUser(), getTranslations('public.devRemoval')]);
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-slate-300">
      <h1 className="mb-4 font-display text-3xl font-black text-white">{t('title')}</h1>
      <p className="mb-6">{t('intro')}</p>

      <section className="mb-8 rounded-2xl border border-slate-700/60 bg-slate-800/30 p-5">
        <h2 className="mb-3 text-lg font-bold text-white">{t('whatHappensTitle')}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm">
          <li>{t('whatHappens1')}</li>
          <li>{t('whatHappens2')}</li>
          <li>{t('whatHappens3')}</li>
          <li>{t('whatHappens4')}</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-5">
        <h2 className="mb-3 text-lg font-bold text-white">{t('proveTitle')}</h2>
        <RemoveCardClient signedIn={!!user} />
      </section>
    </main>
  );
}
