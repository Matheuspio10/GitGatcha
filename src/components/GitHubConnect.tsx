'use client';

import { useCallback, useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { GithubLogo, Sparkle } from '@phosphor-icons/react';

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
            <p className="text-xs text-slate-400 mb-3 flex items-center gap-1.5">
              <Sparkle size={14} weight="fill" className="text-fuchsia-300 flex-shrink-0" />
              Your Signature card ({status.signatureCard.rarity}) is in your collection.
            </p>
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
