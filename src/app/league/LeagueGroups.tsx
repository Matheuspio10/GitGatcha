'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Copy, Crown, LinkSimple, SignOut, UsersThree, X } from '@phosphor-icons/react';
import { useLocale, useTranslations } from 'next-intl';
import { UserAvatar } from '@/components/UserAvatar';
import { copyText } from '@/components/ShareButtons';
import { LEAGUE_GROUP_NAME_MAX, normalizeGroupCode, rankGroup } from '@/lib/league';

// ─── What GET /api/league/groups answers ────────────────────────────────────

interface Member {
  userId: string;
  username: string | null;
  image: string | null;
  owner: boolean;
  you: boolean;
  round: number | null;
  overall: number;
  rounds: number;
}
interface Group { id: string; name: string; code: string; firstRoundId: string; isOwner: boolean; members: Member[] }
interface GroupsState { groups: Group[]; limits: { members: number; perPlayer: number; owned: number } }
interface Preview { id: string; name: string; code: string; members: number; full: boolean; owner: string | null; joined: boolean }

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

const input = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500';
const button = 'rounded-lg px-4 py-2 text-sm font-bold transition-colors disabled:opacity-40';

/** The "Private leagues" tab: create one, join with a code, and every league's table. */
export default function LeagueGroups({ joinCode }: { joinCode?: string }) {
  const t = useTranslations('league.groups');
  const [state, setState] = useState<GroupsState | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/league/groups', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      setState(await res.json());
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (failed) return <p className="py-10 text-center text-rose-300">{t('loadFailed')}</p>;

  return (
    <div className="space-y-6">
      <p className="mx-auto max-w-2xl text-center text-sm text-slate-400">{t('intro')}</p>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <CreateForm onDone={load} />
        <JoinForm initialCode={joinCode} onDone={load} />
      </div>
      {state && <p className="text-center text-xs text-slate-500">{t('limits', state.limits)}</p>}

      {!state ? (
        <p className="animate-pulse py-10 text-center text-slate-400">…</p>
      ) : state.groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-700 py-10 text-center text-sm text-slate-400">{t('empty')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {state.groups.map(g => <GroupCard key={g.id} group={g} max={state.limits.members} onChange={load} />)}
        </div>
      )}
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations('league.groups');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { ok, json } = await post('/api/league/groups', { name });
    setBusy(false);
    if (!ok) { toast.error(json.error || t('loadFailed')); return; }
    toast.success(t('create.created', { code: json.code }));
    setName('');
    onDone();
  };

  return (
    <form onSubmit={create} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="font-bold text-white">{t('create.title')}</h2>
      <input value={name} onChange={e => setName(e.target.value)} maxLength={LEAGUE_GROUP_NAME_MAX} placeholder={t('create.name')} aria-label={t('create.name')} className={input} />
      <button type="submit" disabled={busy || !name.trim()} className={clsx(button, 'w-full bg-emerald-600 text-white hover:bg-emerald-500')}>
        {busy ? t('create.creating') : t('create.submit')}
      </button>
    </form>
  );
}

function JoinForm({ initialCode, onDone }: { initialCode?: string; onDone: () => void }) {
  const t = useTranslations('league.groups');
  const [code, setCode] = useState(initialCode ?? '');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const lookUp = useCallback(async (value: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/league/groups/join?code=${encodeURIComponent(value)}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      // One toast even when an invite link looks the code up twice (dev double effects)
      if (!res.ok) { toast.error(json.error || t('loadFailed'), { id: 'league-group-lookup' }); setPreview(null); return; }
      setPreview(json);
    } finally {
      setBusy(false);
    }
  }, [t]);

  // An invite link (/league?join=CODE) shows what it leads to right away; joining still takes a click
  useEffect(() => {
    if (initialCode && normalizeGroupCode(initialCode)) lookUp(initialCode);
  }, [initialCode, lookUp]);

  const join = async () => {
    if (!preview) return;
    setBusy(true);
    const { ok, json } = await post('/api/league/groups/join', { code: preview.code });
    setBusy(false);
    if (!ok) { toast.error(json.error || t('loadFailed')); return; }
    toast.success(t('join.joined', { name: json.name }));
    setPreview(null);
    setCode('');
    onDone();
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="font-bold text-white">{t('join.title')}</h2>
      <form onSubmit={e => { e.preventDefault(); lookUp(code); }} className="flex gap-2">
        <input
          value={code}
          onChange={e => { setCode(e.target.value); setPreview(null); }}
          placeholder="K7QM-2XRP"
          aria-label={t('join.code')}
          maxLength={20}
          className={clsx(input, 'font-mono uppercase tracking-widest')}
        />
        <button type="submit" disabled={busy || !normalizeGroupCode(code)} className={clsx(button, 'border border-slate-600 text-slate-200 hover:bg-slate-800')}>
          {t('join.check')}
        </button>
      </form>
      {preview && (
        <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="text-sm text-emerald-100">
            {preview.owner
              ? t('join.preview', { name: preview.name, members: preview.members, owner: preview.owner })
              : t('join.previewNoOwner', { name: preview.name, members: preview.members })}
          </p>
          {preview.joined ? (
            <p className="text-xs text-slate-300">{t('join.already')}</p>
          ) : preview.full ? (
            <p className="text-xs text-amber-300">{t('join.full')}</p>
          ) : (
            <button onClick={join} disabled={busy} className={clsx(button, 'w-full bg-emerald-600 text-white hover:bg-emerald-500')}>
              {busy ? t('join.joining') : t('join.submit', { name: preview.name })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function GroupCard({ group, max, onChange }: { group: Group; max: number; onChange: () => void }) {
  const t = useTranslations('league.groups');
  const locale = useLocale();
  const [by, setBy] = useState<'round' | 'overall'>('round');
  // The destructive action waiting for a second click: leave, a new code or removing a member
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const since = new Date(`${group.firstRoundId}T00:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const rows = rankGroup(group.members, by);

  const act = async (body: { action: 'leave' | 'remove' | 'resetCode'; userId?: string }, success: (json: Record<string, string>) => string) => {
    setBusy(true);
    const { ok, json } = await post(`/api/league/groups/${group.id}`, body);
    setBusy(false);
    setConfirming(null);
    if (!ok) { toast.error(json.error || t('loadFailed')); return; }
    toast.success(success(json));
    onChange();
  };

  const copy = async (text: string) => {
    await copyText(text, t('copyPrompt'));
    toast.success(t('copied'));
  };
  const inviteLink = () => `${window.location.origin}/league?join=${group.code}`;

  const confirmBar = (key: string, question: string, run: () => void) => confirming === key && (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
      <span>{question}</span>
      <span className="flex gap-1">
        <button onClick={run} disabled={busy} className="rounded-md bg-rose-600 px-2.5 py-1 font-bold text-white hover:bg-rose-500 disabled:opacity-40">{t('confirm')}</button>
        <button onClick={() => setConfirming(null)} className="rounded-md px-2.5 py-1 font-bold text-slate-300 hover:bg-slate-800">{t('cancel')}</button>
      </span>
    </div>
  );

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 truncate text-lg font-bold text-white"><UsersThree className="shrink-0 text-emerald-400" /> {group.name}</h3>
          <p className="text-xs text-slate-500">{t('members', { count: group.members.length, max })}</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-sm tracking-widest text-emerald-200" title={t('code')}>{group.code}</span>
          <button onClick={() => copy(group.code)} title={t('copyCode')} aria-label={t('copyCode')} className="rounded-lg p-1.5 text-slate-400 hover:text-white"><Copy size={16} /></button>
          <button onClick={() => copy(inviteLink())} title={t('copyLink')} aria-label={t('copyLink')} className="rounded-lg p-1.5 text-slate-400 hover:text-white"><LinkSimple size={16} /></button>
        </div>
      </div>

      <div className="flex gap-1">
        {(['round', 'overall'] as const).map(key => (
          <button key={key} onClick={() => setBy(key)} aria-pressed={by === key}
            className={clsx('rounded-lg border px-2.5 py-1.5 text-xs font-bold', by === key ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 text-slate-400 hover:text-white')}>
            {t(`by.${key}`)}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">{by === 'round' ? t('roundPartial') : t('overallSince', { date: since })}</p>

      <ol className="space-y-1.5">
        {rows.map(m => (
          <li key={m.userId} className="space-y-1">
            <div className={clsx('flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm', m.you && 'bg-emerald-500/10')}>
              <span className="w-6 text-right font-mono text-xs text-slate-500">{m.position}</span>
              <UserAvatar username={m.username ?? '?'} image={m.image} size="sm" />
              <span className="flex min-w-0 flex-1 items-center gap-1 truncate font-bold text-white">
                {m.username}
                {m.owner && <Crown size={12} weight="fill" className="shrink-0 text-amber-300" aria-label={t('owner')} />}
                {m.you && <span className="text-xs font-normal text-emerald-300">({t('you')})</span>}
              </span>
              {by === 'round'
                ? <span className="font-mono text-sm text-emerald-300">{m.round ?? <span className="text-xs text-slate-500">{t('noLineup')}</span>}</span>
                : <span className="text-right font-mono text-sm text-emerald-300">{m.overall} <span className="block text-[10px] text-slate-500">{t('roundsPlayed', { count: m.rounds })}</span></span>}
              {group.isOwner && !m.you && (
                <button onClick={() => setConfirming(`remove:${m.userId}`)} title={t('remove', { name: m.username ?? '?' })} aria-label={t('remove', { name: m.username ?? '?' })} className="rounded-lg p-1 text-slate-500 hover:text-rose-300">
                  <X size={14} weight="bold" />
                </button>
              )}
            </div>
            {confirmBar(`remove:${m.userId}`, t('confirmRemove', { name: m.username ?? '?' }),
              () => act({ action: 'remove', userId: m.userId }, () => t('removed', { name: m.username ?? '?' })))}
          </li>
        ))}
      </ol>

      <div className="space-y-2 border-t border-slate-800 pt-3">
        <div className="flex flex-wrap justify-end gap-2">
          {group.isOwner && (
            <button onClick={() => setConfirming('reset')} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800">{t('resetCode')}</button>
          )}
          <button onClick={() => setConfirming('leave')} className="flex items-center gap-1 rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/10">
            <SignOut size={14} /> {t('leave')}
          </button>
        </div>
        {confirmBar('reset', t('confirmReset'), () => act({ action: 'resetCode' }, json => t('codeReset', { code: json.code })))}
        {confirmBar('leave', group.members.length === 1 ? t('confirmLeaveLast') : t('confirmLeave', { name: group.name }),
          () => act({ action: 'leave' }, () => t('left', { name: group.name })))}
      </div>
    </section>
  );
}
