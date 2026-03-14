'use client';

import { useState, useEffect } from 'react';
import { Scroll } from '@phosphor-icons/react';
import { ChangelogModal } from './ChangelogModal';

export type ChangelogEntry = {
  id: string;
  version: string;
  title: string;
  body: string;
  createdAt: string;
};

export function ChangelogFeature({ username }: { username?: string }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    const fetchChangelogs = async () => {
      try {
        const res = await fetch('/api/changelog');
        if (res.ok) {
          const data = await res.json();
          setEntries(data.entries);
          setSeenIds(data.seenChangelogs);
          
          if (data.entries.length > 0) {
            const hasUnreadLogs = data.entries.some((entry: ChangelogEntry) => !data.seenChangelogs.includes(entry.id));
            setHasUnread(hasUnreadLogs);
          }
        }
      } catch (e) {
        console.error('Failed to fetch changelogs', e);
      }
    };

    fetchChangelogs();
  }, []);

  const handleOpenModal = () => {
    setIsModalOpen(true);
    setHasUnread(false); // Optimistically clear dot immediately
    
    // Determine which ones are newly seen
    const newUnreadIds = entries
      .filter(entry => !seenIds.includes(entry.id))
      .map(entry => entry.id);

    if (newUnreadIds.length > 0 && username) {
      // Mark as read in background
      fetch('/api/changelog/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryIds: newUnreadIds }),
      }).then(res => {
        if(res.ok) {
          setSeenIds(prev => [...prev, ...newUnreadIds]);
        }
      }).catch(e => console.error('Failed to mark read', e));
    }
  };

  return (
    <>
      <button
        onClick={handleOpenModal}
        className="relative flex items-center justify-center gap-1.5 p-2 rounded-full md:rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors min-h-[44px] min-w-[44px]"
        aria-label="Changelog"
        title="Changelog"
      >
        <Scroll size={22} weight="bold" />
        <span className="hidden md:inline font-bold text-sm">Changelog</span>
        {hasUnread && (
          <div className="absolute top-2 right-2 md:top-2 md:right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-slate-900 border border-slate-900 animate-pulse" />
        )}
      </button>

      {isModalOpen && (
        <ChangelogModal
          entries={entries}
          seenIds={seenIds}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </>
  );
}
