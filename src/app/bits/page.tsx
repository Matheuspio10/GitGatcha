import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { getBitsHistory } from '@/lib/bitsLedger';
import { bitsReasonLabel } from '@/lib/bitsReasons';
import { EmptyState } from '@/components/EmptyState';
import { getLocale, getTranslations } from 'next-intl/server';
import { getGameText } from '@/i18n/gameText.server';
import { getStoredText } from '@/i18n/storedText.server';
import { makePackText, packIdForEnglishName } from '@/i18n/packText';
import { isStoredText } from '@/lib/storedText';

export async function generateMetadata() {
  const t = await getTranslations('public.bits');
  return { title: t('metaTitle') };
}

const PAGE = 50;

/** Every BITS change of the player, newest first (src/lib/bitsLedger.ts). */
export default async function BitsHistoryPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/');
  const { before } = await searchParams;
  const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : undefined;
  const [rows, t, locale, game, storedText, packText] = await Promise.all([
    getBitsHistory(user.id, PAGE, beforeDate), getTranslations('public.bits'), getLocale(), getGameText('game'), getStoredText(),
    Promise.all([getGameText('gamePacks'), getGameText('gameBattle')]).then(([packs, battle]) => makePackText(packs, battle)),
  ]);
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  // Rows from before detailText only have the English sentence; a pack purchase still names its pack
  const detailOf = (row: (typeof rows)[number]) => {
    if (isStoredText(row.detailText)) return storedText(row.detailText, row.detail);
    const packId = row.reason === 'pack_purchase' && row.detail ? packIdForEnglishName(row.detail) : undefined;
    return packId ? packText.name(packId, row.detail ?? '') : row.detail;
  };

  return (
    <div className="mx-auto max-w-3xl py-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-white">{t('title')}</h1>
          <p className="text-sm text-slate-400">{beforeDate ? t('subtitleBefore', { date: fmt.format(beforeDate) }) : t('subtitle')}</p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider text-slate-500">{t('balance')}</div>
          <div className="font-mono text-2xl font-bold text-yellow-300">{user.currency.toLocaleString(locale)}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t('emptyTitle')} text={t('emptyText')} actions={[{ label: t('emptyAction'), href: '/store' }]} />
      ) : (
        <ul className="divide-y divide-slate-800 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
          {rows.map(row => (
            <li key={row.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{game(`bitsReasons.${row.reason}`, bitsReasonLabel(row.reason))}</p>
                <p className="truncate text-xs text-slate-500">{[detailOf(row), fmt.format(row.createdAt)].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="text-right">
                <p className={`font-mono font-bold ${row.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {row.amount >= 0 ? '+' : ''}{row.amount.toLocaleString(locale)}
                </p>
                <p className="font-mono text-[11px] text-slate-500">= {row.balanceAfter.toLocaleString(locale)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex justify-between text-sm">
        {beforeDate ? <Link href="/bits" className="text-indigo-300 hover:underline">{t('newest')}</Link> : <span />}
        {rows.length === PAGE && (
          <Link href={`/bits?before=${encodeURIComponent(rows[rows.length - 1].createdAt.toISOString())}`} className="text-indigo-300 hover:underline">
            {t('older')}
          </Link>
        )}
      </div>
    </div>
  );
}
