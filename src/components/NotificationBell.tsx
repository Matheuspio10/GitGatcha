'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Bell, UserPlus, Sword, X } from '@phosphor-icons/react';

interface Notification {
  id: string;
  type: 'friend_request' | 'battle_challenge';
  from: string;
  message: string;
  actionUrl: string;
  createdAt: string;
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

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center justify-center w-10 h-10 rounded-full border border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-white transition-all"
      >
        <Bell size={20} weight={count > 0 ? 'fill' : 'regular'} className={count > 0 ? 'text-indigo-400' : ''} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex items-center justify-center rounded-full h-5 w-5 bg-red-500 text-[10px] font-black text-white">
              {count > 9 ? '9+' : count}
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
                {count > 0 && (
                  <span className="bg-red-500/20 text-red-400 text-[10px] font-black px-2 py-0.5 rounded-full border border-red-500/30">
                    {count}
                  </span>
                )}
              </h3>
              <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white transition-colors p-1">
                <X size={16} />
              </button>
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
                notifications.map((notif) => (
                  <Link
                    key={notif.id}
                    href={notif.actionUrl}
                    onClick={() => setIsOpen(false)}
                    className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-800/60 border-b border-slate-800/50 transition-colors group"
                  >
                    <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center mt-0.5 ${
                      notif.type === 'friend_request'
                        ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                        : 'bg-orange-500/15 text-orange-400 border border-orange-500/20'
                    }`}>
                      {notif.type === 'friend_request' ? (
                        <UserPlus size={16} weight="bold" />
                      ) : (
                        <Sword size={16} weight="bold" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 font-medium group-hover:text-white transition-colors line-clamp-2">
                        {notif.message}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1 font-medium">
                        {timeAgo(notif.createdAt)}
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-5 py-2.5 border-t border-slate-800 bg-slate-900/50">
                <Link
                  href="/friends"
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
