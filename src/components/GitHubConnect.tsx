'use client';

import { useCallback, useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { Check, Copy, GithubLogo, Sparkle } from '@phosphor-icons/react';
import { claimShareBonus, copyText } from './ShareButtons';
import { CardDownloadButton, cardImagePath } from './CardDownloadButton';

interface GitHubStatus {
  connected: boolean;
  tokenValid: boolean;
  login: string | null;
  bonus: number;
  bonusGranted: boolean;
  signatureCard: { name: string; githubUsername: string; avatarUrl: string | null; rarity: string } | null;
}

/** "Connect GitHub" panel: own GitHub quota for boosters, BITS bonus and the Signature card. */
export function GitHubConnect() {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fetchStatus = useCallback(
    () => fetch('/api/user/github', { cache: 'no-store' }).then(res => (res.ok ? (res.json() as Promise<GitHubStatus>) : null)),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    fetchStatus()
      .then(data => { if (!cancelled && data) setStatus(data); })
      .catch(() => { /* leave the panel loading; the rest of the modal still works */ });
    return () => { cancelled = true; };
  }, [fetchStatus]);

  const connect = () => {
    setBusy(true);
    // Signing in with GitHub while logged in links it to this player
    signIn('github', { callbackUrl: window.location.href });
  };

  const disconnect = async () => {
    setBusy(true);
    setError('');
    const res = await fetch('/api/user/github', { method: 'DELETE' });
    if (!res.ok) setError((await res.json()).error || 'Could not disconnect GitHub');
    const data = await fetchStatus().catch(() => null);
    if (data) setStatus(data);
    setBusy(false);
  };

  if (!status) {
    return <div className="h-24 rounded-xl bg-slate-800/40 animate-pulse" aria-label="Loading GitHub connection" />;
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
      <div className="flex items-center gap-2 mb-2">
        <GithubLogo size={20} weight="fill" className="text-white" />
        <span className="text-sm font-bold text-slate-200">GitHub</span>
        {status.connected && status.login && (
          <span className="ml-auto text-xs font-mono text-emerald-400">@{status.login}</span>
        )}
      </div>

      {!status.connected ? (
        <>
          <p className="text-xs text-slate-400 mb-3 leading-relaxed">
            Connect your GitHub account to get <strong className="text-fuchsia-300">your own card in the exclusive Signature foil edition</strong>
            {!status.bonusGranted && <> plus <strong className="text-amber-300">{status.bonus} BITS</strong></>}.
            Your boosters will also use your own GitHub quota, so they stay fast when the game is busy.
          </p>
          <button
            onClick={connect}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white text-slate-900 font-bold hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            <GithubLogo size={18} weight="fill" /> {busy ? 'Redirecting…' : 'Connect GitHub'}
          </button>
        </>
      ) : (
        <>
          {status.signatureCard ? (
            <>
              <p className="text-xs text-slate-400 mb-3 flex items-center gap-1.5">
                <Sparkle size={14} weight="fill" className="text-fuchsia-300 flex-shrink-0" />
                Your Signature card ({status.signatureCard.rarity}) is in your collection.
              </p>
              <SignatureReadme login={status.signatureCard.githubUsername} name={status.signatureCard.name} />
            </>
          ) : (
            <p className="text-xs text-slate-400 mb-3">Connected. Your Signature card will appear in your collection shortly.</p>
          )}
          {!status.tokenValid && (
            <p className="text-xs text-amber-400 mb-3">GitHub no longer accepts this connection. Reconnect to keep using your own quota.</p>
          )}
          <div className="flex gap-2">
            {!status.tokenValid && (
              <button onClick={connect} disabled={busy} className="flex-1 px-3 py-2 rounded-lg bg-white text-slate-900 text-sm font-bold hover:bg-slate-200 disabled:opacity-50">
                Reconnect
              </button>
            )}
            <button onClick={disconnect} disabled={busy} className="flex-1 px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 border border-slate-600 disabled:opacity-50">
              Disconnect
            </button>
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}

/**
 * "Copy for README": markdown that shows the player's Signature card on their
 * GitHub profile README, linking back to its public page (free word of mouth).
 */
function SignatureReadme({ login, name }: { login: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const imagePath = cardImagePath(login, true);

  const copy = async () => {
    const origin = window.location.origin;
    const markdown = `[![${name} on GitGacha](${origin}${imagePath})](${origin}/card/${encodeURIComponent(login)})`;
    await copyText(markdown, 'Copy this into your README:');
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    claimShareBonus();
  };

  return (
    <div className="mb-3 flex items-center gap-3 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5 p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imagePath} alt={`${name} Signature card`} width={60} height={84} className="rounded-md shrink-0" loading="lazy" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-fuchsia-200">Show it on your GitHub profile</p>
        <p className="text-[11px] text-slate-400">Paste in your profile README (github.com/{login}/{login}).</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-500/20 px-2.5 py-1 text-xs font-bold text-fuchsia-100 hover:bg-fuchsia-500/30">
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied!' : 'Copy for README'}
          </button>
          <CardDownloadButton
            login={login}
            signature
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-100 hover:bg-slate-700"
          />
          <a href={`/card/${encodeURIComponent(login)}`} target="_blank" rel="noreferrer" className="text-xs text-slate-400 underline hover:text-white self-center">
            Public page
          </a>
        </div>
      </div>
    </div>
  );
}
