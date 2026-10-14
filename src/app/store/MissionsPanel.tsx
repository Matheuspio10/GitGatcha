'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { ArrowsClockwise, CheckCircle, Circle, GithubLogo } from '@phosphor-icons/react';
import { missionRequiredCount, type MissionPeriod } from '@/lib/missionUtils';

export interface MissionInfo {
  id: string;
  progress: number;
  completed: boolean;
  period: MissionPeriod;
  required?: number;
  mission: { description: string; reward: number; type: string; targetValue: string | null };
}

function requiredFor(um: MissionInfo): number {
  return typeof um.required === 'number' ? um.required : missionRequiredCount(um.mission.type, um.mission.targetValue);
}

function formatDuration(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  return d > 0 ? `${d}d ${h % 24}h` : `${h}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

async function post(url: string, body?: object) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function MissionCard({ um, action }: { um: MissionInfo; action?: React.ReactNode }) {
  const required = requiredFor(um);
  return (
    <div className={`flex flex-col p-5 rounded-2xl border backdrop-blur-sm transition-all ${
      um.completed ? 'border-green-500/30 bg-green-500/5' : 'border-white/10 bg-white/5 hover:border-white/20'
    }`}>
      <div className="flex justify-between items-start gap-3">
        <h3 className={`font-bold ${um.completed ? 'text-green-400' : 'text-white'}`}>{um.mission.description}</h3>
        {um.completed ? <CheckCircle className="text-green-500 shrink-0" size={22} weight="fill" /> : <Circle className="text-slate-500 shrink-0" size={22} />}
      </div>
      <div className="flex justify-between items-end mt-auto pt-4 gap-3">
        <span className="text-yellow-400 font-bold">+{um.mission.reward} BITS</span>
        <div className="flex items-center gap-2">
          {action}
          {um.mission.type !== 'GITHUB_ACTIVITY' && (
            <span className="font-mono text-sm bg-black/40 px-2 py-1 rounded text-slate-300">{Math.min(um.progress, required)} / {required}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Daily (one swap a day), weekly and GitHub dev missions. */
export function MissionsPanel({ missions, canReroll, githubConnected, weeklyResetInMs, profileHref }: {
  missions: MissionInfo[];
  /** Own profile page, where GitHub is connected. */
  profileHref: string;
  canReroll: boolean;
  githubConnected: boolean;
  weeklyResetInMs: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const daily = missions.filter(m => m.period === 'daily');
  const weekly = missions.filter(m => m.period === 'weekly');
  const dev = missions.find(m => m.period === 'dev');

  const reroll = async (um: MissionInfo) => {
    setBusy(um.id);
    try {
      const data = await post('/api/missions/reroll', { userMissionId: um.id });
      toast.success(`New mission: ${data.mission.description}`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const checkGithub = async () => {
    setBusy('dev');
    try {
      const data = await post('/api/missions/dev-check');
      if (data.reward) {
        toast.success(`+${data.reward} BITS for your GitHub activity!`);
        window.dispatchEvent(new Event('bits:refresh'));
        router.refresh();
      } else if (data.done) {
        router.refresh();
      } else {
        toast(`Not on GitHub yet${data.login ? ` for @${data.login}` : ''}. Only public activity counts and it can take a few minutes to show up.`, { icon: '⏳' });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-10">
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
          Today{canReroll ? ' · you can swap one mission' : ''}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {daily.map(um => (
            <MissionCard
              key={um.id}
              um={um}
              action={canReroll && !um.completed ? (
                <button
                  onClick={() => reroll(um)}
                  disabled={busy !== null}
                  className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-50"
                  title="Swap this mission (once a day)"
                  aria-label="Swap this mission"
                >
                  <ArrowsClockwise size={16} className={busy === um.id ? 'animate-spin' : ''} />
                </button>
              ) : undefined}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
          This week <span className="font-mono normal-case text-slate-500">· new ones in {formatDuration(weeklyResetInMs)}</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {weekly.map(um => <MissionCard key={um.id} um={um} />)}
        </div>
      </div>

      <div>
        <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          <GithubLogo size={14} weight="fill" /> Dev mission
        </h3>
        {dev ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MissionCard
              um={dev}
              action={!dev.completed ? (
                <button
                  onClick={checkGithub}
                  disabled={busy !== null}
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-slate-200 disabled:opacity-50"
                >
                  {busy === 'dev' ? 'Checking…' : 'Check GitHub'}
                </button>
              ) : undefined}
            />
            <p className="self-center text-xs text-slate-500">
              Do it on your real GitHub account (public activity only), then press Check GitHub. Resets at midnight UTC.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-5 text-sm text-slate-400">
            {githubConnected
              ? 'Your dev mission shows up here.'
              : <>Connect your GitHub account to get a daily dev mission (push a commit, open a PR, review…) that pays BITS. <Link href={profileHref} className="text-indigo-300 hover:underline">Connect it in your profile</Link>.</>}
          </div>
        )}
      </div>
    </div>
  );
}
