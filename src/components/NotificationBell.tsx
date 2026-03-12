'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Bell, UserPlus, Sword, X, ArrowCircleUp, Checks } from '@phosphor-icons/react';

interface Notification {
  id: string;
  type: 'friend_request' | 'battle_challenge' | 'LEVEL_UP';
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
  const [count, setCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setCount(data.count || 0);
      }
    } catch {
      // silent
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
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

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const unreadCount = notifications.filter(n => n.read === false).length;
  // Use DB unread count plus dynamic count for friend/battle requests
  const displayCount = count;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center justify-center w-10 h-10 rounded-full border border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-white transition-all"
      >
        <Bell size={20} weight={displayCount > 0 ? 'fill' : 'regular'} className={displayCount > 0 ? 'text-indigo-400' : ''} />
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
                Notifications
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
                    title="Mark all as read"
                  >
                    <Checks size={14} />
                    All Read
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white transition-colors p-1">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-5 py-10 text-center text-slate-500">
                  <Bell size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">No notifications</p>
                  <p className="text-xs mt-1">You&apos;re all caught up!</p>
                </div>
              ) : (
                notifications.map((notif) => {
                  const isLevelUp = notif.type === 'LEVEL_UP';
                  const isUnread = notif.read === false;
                  
                  return (
                    <div
                      key={notif.id}
                      onClick={() => {
                        if (isUnread && isLevelUp) markAsRead(notif.id);
                      }}
                      className={`flex items-start gap-3 px-5 py-3.5 hover:bg-slate-800/60 border-b border-slate-800/50 transition-colors group cursor-pointer ${isUnread ? 'bg-slate-800/30' : ''}`}
                    >
                      <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center mt-0.5 ${
                        notif.type === 'friend_request'
                          ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                          : notif.type === 'battle_challenge'
                          ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20'
                          : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20'
                      }`}>
                        {notif.type === 'friend_request' ? (
                          <UserPlus size={16} weight="bold" />
                        ) : notif.type === 'battle_challenge' ? (
                          <Sword size={16} weight="bold" />
                        ) : (
                          <ArrowCircleUp size={16} weight="bold" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        {isLevelUp ? (
                          <>
                            <p className="text-sm text-yellow-400 font-bold group-hover:text-yellow-300 transition-colors">
                              Level Up! Reached {Math.max(...(notif.payload?.levelsCrossed || [0]))}
                            </p>
                            <p className="text-xs text-slate-300 mt-0.5 line-clamp-1">
                              {notif.payload?.packNames.join(', ')}
                            </p>
                            {notif.payload!.totalCoins > 0 && (
                              <p className="text-xs text-yellow-500 mt-0.5">
                                +{notif.payload?.totalCoins} Coins
                              </p>
                            )}
                          </>
                        ) : (
                          <Link href={notif.actionUrl || ''} onClick={() => setIsOpen(false)}>
                            <p className="text-sm text-slate-200 font-medium group-hover:text-white transition-colors line-clamp-2">
                              {notif.message}
                            </p>
                          </Link>
                        )}
                        <p className="text-[11px] text-slate-500 mt-1 font-medium flex items-center justify-between">
                          <span>{timeAgo(notif.createdAt)}</span>
                          {isUnread && <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_5px_rgba(99,102,241,0.5)]"></span>}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-5 py-2.5 border-t border-slate-800 bg-slate-900/50">
                <Link
                  href="/profile"
                  onClick={() => setIsOpen(false)}
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  View all activity →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
