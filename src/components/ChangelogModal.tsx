'use client';

import { useState } from 'react';
import { X, CaretDown, CaretUp } from '@phosphor-icons/react';
import ReactMarkdown from 'react-markdown';
import type { ChangelogEntry } from './ChangelogFeature';

export function ChangelogModal({
  entries,
  seenIds,
  onClose
}: {
  entries: ChangelogEntry[];
  seenIds: string[];
  onClose: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(entries.length > 0 ? entries[0].id : null);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-0 md:pt-20 bg-black/60 backdrop-blur-sm transition-opacity">
      <div 
        className="bg-slate-900 border-x md:border border-slate-700 md:rounded-2xl w-full h-full md:h-auto md:max-h-[560px] md:max-w-[480px] shadow-2xl flex flex-col relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 md:p-5 border-b border-slate-800 shrink-0">
          <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
            Changelog
          </h2>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">
          {entries.length === 0 ? (
            <div className="text-center text-slate-500 py-10 font-bold">No update history found.</div>
          ) : (
            entries.map((entry, idx) => {
              const isUnread = !seenIds.includes(entry.id);
              const isExpanded = expandedId === entry.id;

              return (
                <div key={entry.id} className="relative group">
                  {/* Subtle divider except first */}
                  {idx > 0 && <div className="absolute -top-2 left-0 right-0 border-t border-slate-800" />}
                  
                  <div 
                    className={`relative p-4 rounded-xl transition-all cursor-pointer border ${isUnread ? 'border-l-4 border-l-blue-500 border-slate-800 bg-slate-800/20' : 'border-slate-800 hover:border-slate-700 bg-slate-800/10'}`}
                    onClick={() => toggleExpand(entry.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-indigo-400">{entry.version}</span>
                          {isUnread && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-blue-500 text-white">
                              New
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-white text-lg">{entry.title}</h3>
                      </div>
                      <button className="text-slate-400 mt-1">
                        {isExpanded ? <CaretUp size={20} /> : <CaretDown size={20} />}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-slate-700/50 prose prose-invert max-w-none prose-sm 
                        prose-h3:text-indigo-300 prose-h3:font-black prose-h3:bg-indigo-500/10 prose-h3:px-3 prose-h3:py-1.5 prose-h3:rounded-lg prose-h3:border-l-2 prose-h3:border-indigo-500 prose-h3:mb-4
                        prose-p:text-slate-300 prose-p:leading-relaxed
                        prose-li:text-slate-300
                        prose-strong:text-white prose-strong:font-bold
                        prose-hr:border-slate-800 prose-hr:my-6">
                        <ReactMarkdown>
                          {entry.body}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
