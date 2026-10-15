'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, UserPlus, Sword, X, ArrowCircleUp, Checks, Gift } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { packIdForEnglishName, usePackText } from '@/i18n/packText';

interface Notification {
  id: string;
  type: 'friend_request' | 'battle_challenge' | 'LEVEL_UP' | 'card_gift' | (string & {});
  from?: string;
  message?: string;
  actionUrl?: string;
  createdAt: string;
  read?: boolean;
  payload?: {
    levelsCrossed: number[];
    packNames: string[];
    totalCoins: number;
  };
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  // "5 min ago" labels: the clock is state (render stays pure) and ticks once a minute
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const [count, setCount] = useState(0);
  
  // Track previously seen IDs so we know what's "new" to pop as a toast
  const knownIdsRef = useRef<Set<string>>(new Set());
  const [activeToasts, setActiveToasts] = useState<Notification[]>([]);
  
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const t = useTranslations('notifications.bell');
  const packText = usePackText();

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        const incoming: Notification[] = data.notifications || [];
        setNotifications(incoming);
        setCount(data.count || 0);

        // Diff to find truly NEW notifications that arrived since last poll (and aren't already read)
        if (knownIdsRef.current.size > 0) {
          const newUnread = incoming.filter(n => !n.read && !knownIdsRef.current.has(n.id));
          if (newUnread.length > 0) {
            setActiveToasts(prev => [...prev, ...newUnread]);
          }
        }
        
        // Update known IDs
        const newKnown = new Set(knownIdsRef.current);
        incoming.forEach(n => newKnown.add(n.id));
        knownIdsRef.current = newKnown;
      }
    } catch {
      // silent
    }
  };

  useEffect(() => {
    // The state is set when the fetch resolves, not synchronously (the rule can't see past the await)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000); // Poll every 10s for snappier toasts
    return () => clearInterval(interval);
  }, []);

  // Auto-dismiss toasts after 6 seconds
  useEffect(() => {
    if (activeToasts.length > 0) {
      const timer = setTimeout(() => {
        setActiveToasts(prev => prev.slice(1));
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [activeToasts]);

  // Close on outside click for the dropdown
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const markAsRead = async (id?: string, markAll = false) => {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: id, markAll })
      });
      fetchNotifications();
    } catch (error) {
      console.error('Failed to mark notification as read', error);
    }
  };

  const handleClaimReward = (notifId: string) => {
    markAsRead(notifId);
    setIsOpen(false);
    // Remove from toasts if it was clicked there
    setActiveToasts(prev => prev.filter(t => t.id !== notifId));
    router.push('/inventory');
  };

  const timeAgo = (dateStr: string) => {
    const diff = now - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('timeAgo.justNow');
    if (mins < 60) return t('timeAgo.minutes', { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('timeAgo.hours', { count: hours });
    return t('timeAgo.days', { count: Math.floor(hours / 24) });
  };

  const displayCount = count;

  // Helper to render the body of a Level Up notification specifically
  const renderLevelUpBody = (notif: Notification) => {
    const levels = notif.payload?.levelsCrossed || [0];
    const maxLevel = Math.max(...levels);
    // The payload only keeps English names: map them back to pack ids (unknown names stay as stored)
    const packs = notif.payload?.packNames.map(name => {
      const id = packIdForEnglishName(name);
      return id ? packText.name(id, name) : name;
    }).join(', ') || '';
    const coins = notif.payload?.totalCoins || 0;

    return (
      <div className="flex-1 min-w-0">
        <p className="text-sm text-yellow-400 font-black group-hover:text-yellow-300 transition-colors uppercase tracking-wide">
          {t('levelUp.title', { level: maxLevel })}
        </p>
        <p className="text-sm text-slate-200 mt-1 leading-snug">
          {t.rich('levelUp.body', { level: maxLevel, packs, b: chunks => <span className="font-bold text-indigo-300">{chunks}</span> })}
          {coins > 0 && <span className="text-yellow-500 font-bold"> {t('levelUp.coins', { coins })}</span>}
        </p>
        
        <div className="mt-3 flex gap-2">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              handleClaimReward(notif.id);
            }}
            className="text-xs font-black bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-slate-900 px-4 py-1.5 rounded shadow-lg transition-transform hover:-translate-y-0.5"
          >
            {t('levelUp.claim')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Toast Notification Container */}
      <div className="fixed bottom-[calc(1.5rem+var(--bottom-nav-h))] right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {activeToasts.map((toast) => (
            <motion.div
              key={`toast-${toast.id}`}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
              className="pointer-events-auto w-80 sm:w-96 bg-slate-900 border-2 border-slate-700/80 rounded-2xl p-4 shadow-[0_10px_40px_rgba(0,0,0,0.8)] flex items-start gap-4 relative overflow-hidden group"
            >
              {toast.type === 'LEVEL_UP' && (
                <div className="absolute inset-0 bg-yellow-500/5 mix-blend-overlay pointer-events-none animate-pulse"></div>
              )}
              
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center mt-0.5 ${
                toast.type === 'friend_request'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : toast.type === 'battle_challenge'
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'bg-gradient-to-br from-yellow-400 to-amber-600 text-slate-900 shadow-[0_0_15px_rgba(250,204,21,0.5)]'
              }`}>
                {toast.type === 'friend_request' ? <UserPlus size={20} weight="bold" /> :
                 toast.type === 'battle_challenge' ? <Sword size={20} weight="bold" /> :
                 toast.type === 'card_gift' ? <Gift size={20} weight="fill" /> :
                 <ArrowCircleUp size={24} weight="fill" />}
              </div>
              
              <div className="flex-1 min-w-0 pr-6">
                {toast.type === 'LEVEL_UP' ? (
                  renderLevelUpBody(toast)
                ) : (
                  <>
                    <p className="text-sm font-bold text-white mb-1">{t('toastTitle', { type: toast.type })}</p>
                    <p className="text-sm text-slate-300">{toast.message}</p>
                    {toast.actionUrl && (
                      <Link 
                        href={toast.actionUrl}
                        className="inline-block mt-2 text-xs font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded hover:bg-indigo-500/20 transition-colors border border-indigo-500/20"
                        onClick={() => {
                          markAsRead(toast.id);
                          setActiveToasts(prev => prev.filter(t => t.id !== toast.id));
                        }}
                      >
                        {t('viewDetails')}
                      </Link>
                    )}
                  </>
                )}
              </div>

              <button 
                onClick={() => {
                  markAsRead(toast.id);
                  setActiveToasts(prev => prev.filter(t => t.id !== toast.id));
                }}
                className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors bg-slate-800 rounded-md p-1 opacity-0 group-hover:opacity-100"
              >
                <X size={14} weight="bold" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Bell Icon & Dropdown panel */}
      <div className="relative" ref={panelRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="relative flex items-center justify-center w-10 h-10 rounded-full border border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-white transition-all"
        >
          <Bell size={20} weight={displayCount > 0 ? 'fill' : 'regular'} className={displayCount > 0 ? 'text-indigo-400 animate-pulse' : ''} />
          {displayCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex items-center justify-center rounded-full h-5 w-5 bg-red-500 text-[10px] font-black text-white">
                {displayCount > 9 ? '9+' : displayCount}
              </span>
            </span>
          )}
        </button>

        {isOpen && (
          <div className="absolute right-0 top-12 w-80 sm:w-96 z-[999] animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Bell size={16} weight="fill" className="text-indigo-400" />
                  {t('title')}
                  {displayCount > 0 && (
                    <span className="bg-red-500/20 text-red-400 text-[10px] font-black px-2 py-0.5 rounded-full border border-red-500/30">
                      {displayCount}
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-2">
                  {displayCount > 0 && (
                    <button 
                      onClick={() => markAsRead(undefined, true)} 
                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 bg-indigo-500/10 px-2 py-1 rounded border border-indigo-500/20"
                      title={t('markAllRead')}
                    >
                      <Checks size={14} />
                      {t('allRead')}
                    </button>
                  )}
                  <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white transition-colors p-1">
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Notifications List */}
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-5 py-10 text-center text-slate-500">
                    <Bell size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">{t('empty')}</p>
                    <p className="text-xs mt-1">{t('emptyText')}</p>
                  </div>
                ) : (
                  notifications.map((notif) => {
                    const isLevelUp = notif.type === 'LEVEL_UP';
                    const isUnread = notif.read === false;
                    
                    return (
                      <div
                        key={notif.id}
                        className={`flex items-start gap-4 px-5 py-4 hover:bg-slate-800/60 border-b border-slate-800/50 transition-colors group ${isUnread ? 'bg-slate-800/30' : ''}`}
                      >
                        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center mt-0.5 ${
                          notif.type === 'friend_request'
                            ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                            : notif.type === 'battle_challenge'
                            ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20'
                            : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20'
                        }`}>
                          {notif.type === 'friend_request' ? <UserPlus size={18} weight="bold" /> :
                           notif.type === 'battle_challenge' ? <Sword size={18} weight="bold" /> :
                           notif.type === 'card_gift' ? <Gift size={18} weight="fill" /> :
                           <ArrowCircleUp size={20} weight="fill" />}
                        </div>
                        
                        {isLevelUp ? (
                          renderLevelUpBody(notif)
                        ) : (
                          <div className="flex-1 min-w-0" onClick={() => { if(isUnread) markAsRead(notif.id); }}>
                            <Link href={notif.actionUrl || ''} onClick={() => setIsOpen(false)}>
                              <p className="text-sm text-slate-200 font-medium group-hover:text-white transition-colors">
                                {notif.message}
                              </p>
                            </Link>
                            <p className="text-[11px] text-slate-500 mt-1 font-medium flex items-center justify-between">
                              <span>{timeAgo(notif.createdAt)}</span>
                              {isUnread && <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_5px_rgba(99,102,241,0.5)]"></span>}
                            </p>
                          </div>
                        )}
                        
                        {isLevelUp && (
                          <div className="flex flex-col items-end justify-between self-stretch">
                            <button 
                              onClick={(e) => { e.stopPropagation(); markAsRead(notif.id); }}
                              className="text-slate-500 hover:text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              title={t('dismiss')}
                            >
                              <X size={14} />
                            </button>
                            <p className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
                              {timeAgo(notif.createdAt)}
                            </p>
                          </div>
                        )}

                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/80">
                  <Link
                    href="/profile"
                    onClick={() => setIsOpen(false)}
                    className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors w-full inline-block text-center"
                  >
                    {t('viewAll')}
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
