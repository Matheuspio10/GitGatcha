import Link from 'next/link';
import { Trophy, Medal, Timer, Lightning } from '@phosphor-icons/react/dist/ssr';
import { ALL_PACKS } from '@/lib/packDefinitions';
import { formatSeasonLeft } from '@/lib/seasons';
import { SPRINT_REWARDS, SPRINT_TEAM_SIZE, sprintKindLabel, sprintRewardsLegend } from '@/lib/sprints';
import type { SprintState } from '@/lib/sprintService';
import { RarityGem } from '@/components/RarityGem';

function Position({ position }: { position: number }) {
  if (position === 1) return <Trophy className="text-yellow-400" size={20} weight="fill" />;
  if (position === 2) return <Medal className="text-slate-300" size={20} weight="fill" />;
  if (position === 3) return <Medal className="text-amber-600" size={20} weight="fill" />;
  return <span className="font-mono font-bold text-slate-500">{position}</span>;
}

/** One running sprint: theme, time left, rewards, the viewer's place and cards, the live top and the last result. */
export function SprintBoard({ sprint, now, viewerId }: { sprint: SprintState; now: Date; viewerId?: string }) {
  const languages = sprint.theme.languages;
  const packs = ALL_PACKS.filter(p => p.pool.languages?.some(l => languages.includes(l)));
  const paidPlaces = SPRINT_REWARDS[sprint.kind][SPRINT_REWARDS[sprint.kind].length - 1].upTo;
  const accent = sprint.kind === 'daily' ? 'text-cyan-300 border-cyan-500/30 bg-cyan-500/5' : 'text-fuchsia-300 border-fuchsia-500/30 bg-fuchsia-500/5';

  return (
    <section className={`rounded-2xl border p-5 space-y-4 ${accent}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider">{sprintKindLabel(sprint.kind)}</p>
          <h2 className="text-2xl font-black text-white">{sprint.theme.name}</h2>
          <p className="text-xs text-slate-400">
            {languages.length > 1 ? `Cards in ${languages.join(', ')}` : `${languages[0]} cards`} · your best {SPRINT_TEAM_SIZE} count (ATK + DEF + HP)
          </p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <p className="flex items-center justify-end gap-1">
            <Timer size={14} weight="fill" /> Ends in <span className="font-mono font-bold text-white">{formatSeasonLeft(sprint.endsAt.getTime() - now.getTime())}</span>
          </p>
          <p className="mt-1">BITS: {sprintRewardsLegend(sprint.kind)}</p>
        </div>
      </div>

      {viewerId && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          {sprint.you ? (
            <p className="text-sm text-slate-300">
              You are <span className="font-black text-white">#{sprint.you.position}</span> of {sprint.players} with{' '}
              <span className="font-mono font-bold text-emerald-300">{sprint.you.score}</span> power
              {sprint.you.rewardBits > 0
                ? <> · <span className="text-yellow-300">+{sprint.you.rewardBits} BITS</span> if it ends now</>
                : <> · the top {paidPlaces} get BITS</>}
            </p>
          ) : (
            <p className="text-sm text-slate-400">You have no {languages.length > 1 ? 'cards of this theme' : `${languages[0]} cards`} yet, so you are not in this sprint.</p>
          )}
          {sprint.yourCards.length > 0 && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-3">
              {sprint.yourCards.map(c => (
                <li key={c.githubUsername}>
                  <Link href={`/card/${encodeURIComponent(c.githubUsername)}`} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2 hover:border-slate-600">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c.avatarUrl ? <img src={c.avatarUrl} alt="" className="h-8 w-8 rounded-full" /> : <span className="h-8 w-8 rounded-full bg-slate-700" />}
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
              <Lightning size={12} weight="fill" className="inline" /> Boosters with these cards:{' '}
              {packs.map((p, i) => (
                <span key={p.id}>{i > 0 && ', '}<Link href="/store" className="text-indigo-300 hover:underline">{p.name}</Link></span>
              ))}
              . The Forge works too.
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
              <span className="text-xs text-slate-500">{s.cards} card{s.cards === 1 ? '' : 's'}</span>
              <span className="w-16 text-right font-mono font-bold text-emerald-300">{s.score}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-center text-sm text-slate-500">Nobody has a card of this theme yet. The first one takes the top spot.</p>
      )}

      {sprint.last && (
        <p className="text-xs text-slate-500">
          Last {sprint.kind === 'daily' ? 'daily' : 'weekly'} sprint ({sprint.last.theme.name}):{' '}
          {sprint.last.winners.length > 0
            ? <>won by {sprint.last.winners.map(w => w.username).join(', ')} ({sprint.last.winners[0].score})</>
            : 'nobody took part'}
          {sprint.last.you && <> · you finished #{sprint.last.you.position}{sprint.last.you.rewardBits > 0 ? ` (+${sprint.last.you.rewardBits} BITS)` : ''}</>}
        </p>
      )}
    </section>
  );
}
