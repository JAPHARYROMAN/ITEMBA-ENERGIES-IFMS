
import React, { useState } from 'react';
// Fix: Correctly importing NavLink and useLocation from react-router-dom
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronDown, Activity, Sparkles, Orbit } from 'lucide-react';
import { NAV_ITEMS } from '../constants';
import { useAppStore, useAuthStore } from '../store';
import { SidebarItem } from '../types';

const NavItem: React.FC<{ item: SidebarItem; collapsed: boolean }> = ({ item, collapsed }) => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const isActive = location.pathname.startsWith(item.path);
  const hasChildren = item.children && item.children.length > 0;
  const isReports = item.category === 'Reports';

  return (
    <div className="mb-0.5">
      {hasChildren ? (
        <>
          <button
            onClick={() => !collapsed && setIsOpen(!isOpen)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all group ${
              isActive 
                ? isReports ? 'bg-indigo-600/10 text-indigo-600' : 'bg-primary/10 text-primary' 
                : 'hover:bg-muted/50 text-muted-foreground'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <item.icon size={16} className={`${isActive ? isReports ? 'text-indigo-600' : 'text-primary' : 'group-hover:text-foreground opacity-70'}`} />
                {item.badge && !collapsed && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                  </span>
                )}
              </div>
              {!collapsed && (
                <span className={`font-bold text-xs tracking-tight ${isReports ? 'text-indigo-900 dark:text-indigo-200' : ''}`}>
                  {item.name}
                </span>
              )}
            </div>
            {!collapsed && <ChevronDown size={12} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : 'opacity-40'}`} />}
          </button>
          
          {isOpen && !collapsed && (
            <div className="ml-4.5 mt-1 flex flex-col gap-0.5 border-l-2 border-border pl-4 py-1 animate-in slide-in-from-left-2 duration-200">
              {item.children?.map(child => (
                <NavLink
                  key={child.path}
                  to={child.path}
                  className={({ isActive }) => `px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all relative ${
                    isActive 
                      ? isReports ? 'text-indigo-600 bg-indigo-500/5' : 'text-primary bg-primary/5' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                  }`}
                >
                  {isActive && (
                    <div className={`absolute left-[-18px] top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${isReports ? 'bg-indigo-600' : 'bg-primary'}`} />
                  )}
                  {child.name}
                </NavLink>
              ))}
            </div>
          )}
        </>
      ) : (
        <NavLink
          to={item.path}
          className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-xl transition-all group ${
            isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-muted-foreground'
          }`}
        >
          <item.icon size={16} className={`${isActive ? 'text-primary' : 'group-hover:text-foreground opacity-70'}`} />
          {!collapsed && <span className="font-bold text-xs tracking-tight">{item.name}</span>}
        </NavLink>
      )}
    </div>
  );
};

const Sidebar: React.FC = () => {
  const { sidebarCollapsed, toggleSidebar } = useAppStore();
  const { user } = useAuthStore();

  const filteredNav = NAV_ITEMS.filter(item => {
    if (!item.roles) return true;
    return user && item.roles.includes(user.role);
  });

  const groupedNav = filteredNav.reduce((acc, item) => {
    const cat = item.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, SidebarItem[]>);

  const categories = ['General', 'Reports', 'Operations', 'Finance', 'Governance', 'Setup'].filter(c => groupedNav[c]);

  return (
    <aside 
      className={`fixed left-0 top-0 bottom-0 z-50 bg-card border-r border-border transition-all duration-300 flex flex-col ${sidebarCollapsed ? 'w-20' : 'w-64'}`}
    >
      <div className="h-16 flex items-center px-5 border-b border-border bg-muted/10">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex-shrink-0 w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/20">
            <Orbit size={18} />
          </div>
          {!sidebarCollapsed && (
            <div className="flex flex-col animate-in fade-in slide-in-from-left-4">
              <span className="text-sm font-black tracking-tight leading-none">IFMS ENTERPRISE</span>
              <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mt-1 opacity-80">Intelligence Hub</span>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 px-3 overflow-y-auto pt-6 space-y-8 no-scrollbar">
        {categories.map(cat => (
          <div key={cat} className="space-y-1.5">
            {!sidebarCollapsed && (
              <p className="px-3 mb-2.5 text-[9px] font-black text-muted-foreground uppercase tracking-[0.25em] opacity-40 flex items-center gap-2">
                {cat === 'Reports' && <Sparkles size={9} className="text-indigo-500" />}
                {cat}
              </p>
            )}
            {groupedNav[cat].map((item) => (
              <NavItem key={item.path} item={item} collapsed={sidebarCollapsed} />
            ))}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-border bg-muted/5">
        <button 
          onClick={toggleSidebar}
          className="w-full h-10 flex items-center justify-center hover:bg-muted rounded-xl text-muted-foreground transition-all group border border-transparent hover:border-border"
          aria-label={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {sidebarCollapsed ? <ChevronRight size={18} className="group-hover:text-primary transition-all" /> : (
            <div className="flex items-center gap-2">
              <ChevronLeft size={16} className="opacity-40 group-hover:opacity-100 group-hover:-translate-x-1 transition-all" />
              <span className="text-[10px] font-black uppercase tracking-widest">Workspace</span>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
