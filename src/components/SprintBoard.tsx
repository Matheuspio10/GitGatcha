import { sizedAvatar } from '@/lib/avatarUrl';
import Link from 'next/link';
import { Trophy, Medal, Timer, Lightning, Sparkle } from '@phosphor-icons/react/dist/ssr';
import { ALL_PACKS } from '@/lib/packDefinitions';
import { formatSeasonLeft } from '@/lib/seasons';
import { SPRINT_REWARDS, SPRINT_TEAM_SIZE, sprintKindLabel, sprintRewardsLegend, sprintThemeById, type SprintKind, type SprintTheme } from '@/lib/sprints';
import type { SprintState } from '@/lib/sprintService';
import type { WeeklyEvent } from '@/lib/weeklyEventService';
import { RarityGem } from '@/components/RarityGem';
import { useTranslations } from 'next-intl';
import { useGameText, type GameText } from '@/i18n/gameText';

/** Sprint theme name ("Web Week", "Rust Day") in the active language. */
function themeName(battleText: GameText, theme: SprintTheme): string {
  return theme.id.startsWith('family:')
    ? battleText(`sprints.families.${theme.id}.name`, theme.name)
    : battleText('sprints.languageTheme.name', theme.name, { language: theme.languages[0] ?? theme.id.replace(/^lang:/, '') });
}

/** "1st 200 · 2nd 120 · 3rd 80 · 4th–10th 30", rebuilt piece by piece from SPRINT_REWARDS. */
function rewardsLegend(battleText: GameText, kind: SprintKind): string {
  const fallback = sprintRewardsLegend(kind);
  let from = 1;
  let missing = false;
  const legend = SPRINT_REWARDS[kind].map(r => {
    const piece = r.upTo === from
      ? battleText('sprints.rewardsLegend.single', '', { place: from, bits: r.bits })
      : battleText('sprints.rewardsLegend.range', '', { from, to: r.upTo, bits: r.bits });
    if (!piece) missing = true;
    from = r.upTo + 1;
    return piece;
  }).join(' · ');
  return missing ? fallback : legend;
}

/** Pack name by id; event packs are "<theme> Pack" with the translated sprint theme. */
function packName(packText: GameText, battleText: GameText, pack: { id: string; name: string }): string {
  if (pack.id.startsWith('event-')) {
    const theme = sprintThemeById(`family:${pack.id.slice('event-'.length)}`);
    const name = theme.id.startsWith('family:') ? themeName(battleText, theme) : pack.name.replace(/ Pack$/, '');
    return packText('eventPack.name', pack.name, { theme: name });
  }
  return packText(`packs.${pack.id}.name`, pack.name);
}

function Position({ position }: { position: number }) {
  if (position === 1) return <Trophy className="text-yellow-400" size={20} weight="fill" />;
  if (position === 2) return <Medal className="text-slate-300" size={20} weight="fill" />;
  if (position === 3) return <Medal className="text-amber-600" size={20} weight="fill" />;
  return <span className="font-mono font-bold text-slate-500">{position}</span>;
}

/** One running sprint: theme, time left, rewards, the viewer's place and cards, the live top and the last result. */
export function SprintBoard({ sprint, now, viewerId, event }: { sprint: SprintState; now: Date; viewerId?: string; event?: WeeklyEvent | null }) {
  const languages = sprint.theme.languages;
  const packs = [...(event ? [{ id: event.pack.id, name: event.pack.name }] : []), ...ALL_PACKS.filter(p => p.pool.languages?.some(l => languages.includes(l)))];
  const paidPlaces = SPRINT_REWARDS[sprint.kind][SPRINT_REWARDS[sprint.kind].length - 1].upTo;
  const t = useTranslations('leaderboard.sprint');
  const battleText = useGameText('gameBattle');
  const packText = useGameText('gamePacks');
  const featured = event?.featuredDev;
  const accent = sprint.kind === 'daily' ? 'text-cyan-300 border-cyan-500/30 bg-cyan-500/5' : 'text-fuchsia-300 border-fuchsia-500/30 bg-fuchsia-500/5';

  return (
    <section className={`rounded-2xl border p-5 space-y-4 ${accent}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider">{battleText(`sprints.kinds.${sprint.kind}.label`, sprintKindLabel(sprint.kind))}</p>
          <h2 className="text-2xl font-black text-white">{themeName(battleText, sprint.theme)}</h2>
          <p className="text-xs text-slate-400">
            {t('bestCount', {
              cards: languages.length > 1 ? t('cardsInLanguages', { languages: languages.join(', ') }) : t('languageCards', { language: languages[0] }),
              count: SPRINT_TEAM_SIZE,
            })}
          </p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <p className="flex items-center justify-end gap-1">
            <Timer size={14} weight="fill" /> {t.rich('endsIn', {
              left: formatSeasonLeft(sprint.endsAt.getTime() - now.getTime()),
              time: chunks => <span className="font-mono font-bold text-white">{chunks}</span>,
            })}
          </p>
          <p className="mt-1">{t('bitsLegend', { legend: rewardsLegend(battleText, sprint.kind) })}</p>
        </div>
      </div>

      {event && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-fuchsia-500/30 bg-slate-950/60 p-3 text-sm text-slate-300">
          <Sparkle size={18} weight="fill" className="shrink-0 text-fuchsia-300" />
          <span className="min-w-0 flex-1">
            {t.rich('eventSale', {
              pack: packName(packText, battleText, event.pack),
              packLink: chunks => <Link href={`/store#pack-${event.pack.id}`} className="font-bold text-fuchsia-200 hover:underline">{chunks}</Link>,
            })}
            {featured && (
              <>
                {' '}
                {t.rich('eventDev', {
                  dev: featured.name,
                  rarity: featured.rarity,
                  percent: event.discountPercent,
                  devLink: chunks => <Link href={`/forge?dev=${encodeURIComponent(featured.githubUsername)}`} className="font-bold text-white hover:underline">{chunks}</Link>,
                })}
              </>
            )}
          </span>
        </div>
      )}

      {viewerId && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          {sprint.you ? (
            <p className="text-sm text-slate-300">
              {t.rich('youAre', {
                position: String(sprint.you.position),
                players: String(sprint.players),
                score: String(sprint.you.score),
                b: chunks => <span className="font-black text-white">{chunks}</span>,
                power: chunks => <span className="font-mono font-bold text-emerald-300">{chunks}</span>,
              })}
              {sprint.you.rewardBits > 0
                ? <> · {t.rich('ifEndsNow', { bits: String(sprint.you.rewardBits), reward: chunks => <span className="text-yellow-300">{chunks}</span> })}</>
                : <> · {t('topPaid', { count: paidPlaces })}</>}
            </p>
          ) : (
            <p className="text-sm text-slate-400">{languages.length > 1 ? t('notInTheme') : t('notInLanguage', { language: languages[0] })}</p>
          )}
          {sprint.yourCards.length > 0 && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-3">
              {sprint.yourCards.map(c => (
                <li key={c.githubUsername}>
                  <Link href={`/card/${encodeURIComponent(c.githubUsername)}`} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2 hover:border-slate-600">
                    {c.avatarUrl ? <img src={sizedAvatar(c.avatarUrl, 32)} alt="" className="h-8 w-8 rounded-full" /> : <span className="h-8 w-8 rounded-full bg-slate-700" />}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 truncate text-sm font-bold text-white">
                        <RarityGem rarity={c.rarity} size={12} title={c.rarity} />
                        <span className="truncate">{c.name}</span>
                        {c.isShiny && <span className="text-[10px] text-yellow-300">✦</span>}
                      </span>
                      <span className="block text-[11px] text-slate-500">{c.primaryLanguage} · <span className="font-mono text-slate-300">{c.power}</span></span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {packs.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              <Lightning size={12} weight="fill" className="inline" /> {t('boosters')}{' '}
              {packs.map((p, i) => (
                <span key={p.id}>{i > 0 && ', '}<Link href={`/store#pack-${p.id}`} className="text-indigo-300 hover:underline">{packName(packText, battleText, p)}</Link></span>
              ))}
              {t('forgeToo')}
            </p>
          )}
        </div>
      )}

      {sprint.standings.length > 0 ? (
        <ol className="divide-y divide-slate-800/60 rounded-xl border border-slate-800 bg-slate-950/40">
          {sprint.standings.map(s => (
            <li key={s.userId} className={`flex items-center gap-3 px-4 py-2 ${s.userId === viewerId ? 'bg-indigo-500/10' : ''}`}>
              <span className="flex w-8 justify-center"><Position position={s.position} /></span>
              <Link href={`/u/${encodeURIComponent(s.username)}`} className="flex-1 truncate font-bold text-white hover:text-indigo-300">{s.username}</Link>
              <span className="text-xs text-slate-500">{t('cards', { count: s.cards })}</span>
              <span className="w-16 text-right font-mono font-bold text-emerald-300">{s.score}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-center text-sm text-slate-500">{t('empty')}</p>
      )}

      {sprint.last && (
        <p className="text-xs text-slate-500">
          {t('last', { kind: sprint.kind, theme: themeName(battleText, sprint.last.theme) })}{' '}
          {sprint.last.winners.length > 0
            ? t('wonBy', { names: sprint.last.winners.map(w => w.username).join(', '), score: String(sprint.last.winners[0].score) })
            : t('nobody')}
          {sprint.last.you && <> · {t('youFinished', { position: String(sprint.last.you.position) })}{sprint.last.you.rewardBits > 0 ? ` (+${sprint.last.you.rewardBits} BITS)` : ''}</>}
        </p>
      )}
    </section>
  );
}
