
import React, { useState, useEffect, useRef } from 'react';
import { Search, Command, ArrowRight, X } from 'lucide-react';
// Fix: Correctly importing useNavigate from react-router-dom
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { NAV_ITEMS } from '../../constants';

export const CommandMenu: React.FC = () => {
  const { isSearchOpen, setSearchOpen } = useAppStore();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 10);
    } else {
      setQuery('');
    }
  }, [isSearchOpen]);

  const flatNav = React.useMemo(() => {
    const items: { name: string; path: string; category: string }[] = [];
    NAV_ITEMS.forEach(item => {
      if (item.children) {
        item.children.forEach(child => {
          items.push({ name: child.name, path: child.path, category: item.name });
        });
      } else {
        items.push({ name: item.name, path: item.path, category: 'General' });
      }
    });
    return items;
  }, []);

  const results = flatNav.filter(item => 
    item.name.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8);

  if (!isSearchOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => setSearchOpen(false)} />
      
      <div className="relative w-full max-w-xl bg-card border border-border shadow-2xl rounded-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center px-4 py-4 border-b border-border bg-muted/20">
          <Search size={18} className="text-muted-foreground mr-3" />
          <input 
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a module or report name..."
            className="flex-1 bg-transparent border-none outline-none text-sm font-medium"
          />
          <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded border border-border text-[10px] font-black text-muted-foreground">
            <Command size={10} />
            <span>K</span>
          </div>
          <button onClick={() => setSearchOpen(false)} className="ml-4 p-1 hover:bg-muted rounded-full">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        <div className="max-h-[400px] overflow-y-auto p-2">
          {results.length > 0 ? (
            <div className="space-y-1">
              {results.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    navigate(item.path);
                    setSearchOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-primary/10 rounded-xl group transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                      <ArrowRight size={14} />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold">{item.name}</p>
                      <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{item.category}</p>
                    </div>
                  </div>
                  <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all text-primary" />
                </button>
              ))}
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center opacity-40">
              <Search size={40} className="mb-4" />
              <p className="text-sm font-bold">No matching modules found</p>
              <p className="text-xs uppercase tracking-widest mt-1">Try searching for 'Reports' or 'Stations'</p>
            </div>
          )}
        </div>

        <div className="p-3 bg-muted/30 border-t border-border flex items-center justify-between">
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Enterprise Command Palette</p>
          <div className="flex gap-4">
             <span className="flex items-center gap-1 text-[9px] text-muted-foreground uppercase font-bold"><kbd className="px-1 border border-border rounded">Esc</kbd> Close</span>
             <span className="flex items-center gap-1 text-[9px] text-muted-foreground uppercase font-bold"><kbd className="px-1 border border-border rounded">↵</kbd> Select</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const ChevronRight = ({ size, className }: { size: number, className: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m9 18 6-6-6-6"/></svg>
);
