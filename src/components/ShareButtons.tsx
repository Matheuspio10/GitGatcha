'use client';

import { useState, useSyncExternalStore } from 'react';

const noSubscribe = () => () => {};
import { toast } from 'react-hot-toast';
import { Check, Copy, ShareNetwork, XLogo } from '@phosphor-icons/react';

/**
 * Copies `text`; when the browser refuses the clipboard (permissions, old
 * browsers) it shows the text in a prompt so it can be copied by hand.
 * Resolves true when the text was copied or shown.
 */
export async function copyText(text: string, label = 'Copy this link:'): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt(label, text);
    return true;
  }
}

/** First share pays a one-time bonus (the server ignores repeats and visitors). */
export function claimShareBonus() {
  fetch('/api/user/share-bonus', { method: 'POST' })
    .then(res => (res.ok ? res.json() : null))
    .then(data => {
      if (data?.granted) {
        toast.success(`+${data.granted} BITS for your first share!`);
        window.dispatchEvent(new Event('bits:refresh'));
      }
    })
    .catch(() => { /* the share itself already worked */ });
}

/** Copy link · post on X · the phone's share sheet (when available). */
export function ShareButtons({ url, text, extra }: { url: string; text: string; extra?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  // false on the server render, the real answer once hydrated (no mismatch)
  const canNativeShare = useSyncExternalStore(noSubscribe, () => typeof navigator.share === 'function', () => false);

  const copy = async () => {
    await copyText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    claimShareBonus();
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: 'GitGacha', text, url });
      claimShareBonus();
    } catch { /* cancelled */ }
  };

  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const button = 'inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-700';

  return (
    <div className="flex flex-wrap justify-center gap-2 md:justify-start">
      <button onClick={copy} className={button}>
        {copied ? <Check size={16} className="text-commit" /> : <Copy size={16} />} {copied ? 'Copied!' : 'Copy link'}
      </button>
      <a href={xUrl} target="_blank" rel="noreferrer" onClick={claimShareBonus} className={button}>
        <XLogo size={16} /> Post on X
      </a>
      {canNativeShare && (
        <button onClick={nativeShare} className={button}>
          <ShareNetwork size={16} /> Share…
        </button>
      )}
      {extra}
    </div>
  );
}
