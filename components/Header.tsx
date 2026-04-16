import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Bell, Search, LogOut, Info, Command, Sparkles } from 'lucide-react';
import { useAppStore, useAuthStore } from '../store';
import Breadcrumbs from './ifms/Breadcrumbs';
import { NotificationBell } from './ifms/notifications/NotificationBell';
import { StationSwitcher } from './ifms/StationSwitcher';
import {
  useNotifications,
  useUnreadCount,
  useOptimisticMarkRead,
  useOptimisticArchive,
  useMarkAllRead,
} from '@/lib/hooks/notifications';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const Header: React.FC = () => {
  const { t } = useTranslation();
  const { theme, setTheme, sidebarCollapsed, setSearchOpen, isAiPanelOpen, toggleAiPanel } =
    useAppStore();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  // Notification hooks
  const { data: notificationsData, refetch: refetchNotifications } = useNotifications({
    page: 1,
    pageSize: 50, // Load recent notifications for header
  });
  const { data: unreadCount = 0 } = useUnreadCount();
  const { markReadOptimistic } = useOptimisticMarkRead();
  const { archiveOptimistic } = useOptimisticArchive();
  const { mutate: markAllRead } = useMarkAllRead();

  const notifications = notificationsData?.deliveries || [];

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        setNotificationsOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'manager':
        return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'cashier':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'auditor':
        return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const handleMarkRead = (id: string) => {
    markReadOptimistic(id);
  };

  const handleArchive = (id: string) => {
    archiveOptimistic(id);
  };

  const handleMarkAllRead = () => {
    markAllRead();
  };

  const handleOpenAction = (actionUrl: string) => {
    navigate(actionUrl);
  };

  const handleMarkSeen = async (ids: string[]) => {
    // Mark notifications as seen in the database
    try {
      await fetch('/api/notifications/mark-seen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids }),
      });
      // Refetch to update the UI
      refetchNotifications();
    } catch (error) {
      console.error('Failed to mark notifications as seen:', error);
      useAppStore.getState().addToast(t('header.failedNotifications'), 'error');
    }
  };

  return (
    <header
      className={`fixed top-0 right-0 z-40 h-16 bg-background/60 backdrop-blur-xl border-b border-border px-6 flex items-center justify-between transition-all duration-300 ${sidebarCollapsed ? 'left-20' : 'left-64'}`}
    >
      <div className="flex items-center gap-4 flex-1">
        <Breadcrumbs />
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[9px] font-black text-emerald-600 uppercase tracking-[0.1em] shadow-sm">
          <Info size={10} />
          {t('header.apiMode')}
        </div>
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-[9px] font-black text-amber-600 uppercase tracking-[0.1em] shadow-sm">
          <Info size={10} />
          {t('header.coreProduction')}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setSearchOpen(true)}
          className="hidden lg:flex items-center gap-6 h-9 px-3 bg-muted/50 border border-input rounded-xl hover:border-primary/50 transition-all group"
        >
          <div className="flex items-center gap-2">
            <Search
              size={14}
              className="text-muted-foreground group-hover:text-primary transition-colors"
            />
            <span className="text-xs text-muted-foreground font-medium">
              {t('header.quickFind')}
            </span>
          </div>
          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-background border border-border rounded text-[10px] font-black text-muted-foreground">
            <Command size={10} />
            <span>K</span>
          </div>
        </button>

        <div className="h-4 w-px bg-border mx-1"></div>

        <StationSwitcher />

        <div className="h-4 w-px bg-border mx-1"></div>

        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="w-9 h-9 flex items-center justify-center hover:bg-muted rounded-xl text-muted-foreground transition-colors"
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="h-4 w-px bg-border mx-1"></div>

        <NotificationBell
          unreadCount={unreadCount}
          notifications={notifications}
          onMarkRead={handleMarkRead}
          onArchive={handleArchive}
          onMarkAllRead={handleMarkAllRead}
          onOpenAction={handleOpenAction}
          onMarkSeen={handleMarkSeen}
        />

        <div className="h-4 w-px bg-border mx-1"></div>

        <button
          onClick={toggleAiPanel}
          className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${
            isAiPanelOpen
              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
              : 'hover:bg-muted text-muted-foreground'
          }`}
          aria-label={t('ai.title')}
          title={t('ai.title')}
        >
          <Sparkles size={18} />
        </button>

        <div className="h-4 w-px bg-border mx-1"></div>

        <div className="flex items-center gap-3 pl-1 group">
          <div className="text-right hidden sm:block">
            <p className="text-[11px] font-black leading-tight tracking-tight">{user?.name}</p>
            <span
              className={`text-[9px] px-2 py-0.5 rounded-full border uppercase tracking-widest font-black mt-1 inline-block ${getRoleColor(user?.role || '')}`}
            >
              {user?.role}
            </span>
          </div>
          <button
            onClick={logout}
            className="w-9 h-9 bg-muted/50 hover:bg-rose-500 hover:text-white rounded-xl flex items-center justify-center transition-all shadow-sm border border-border"
            aria-label="Logout"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
