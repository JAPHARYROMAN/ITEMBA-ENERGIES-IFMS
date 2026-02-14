
import React from 'react';
import { X } from 'lucide-react';

interface DetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  variant?: 'default' | 'large';
}

const DetailsDrawer: React.FC<DetailsDrawerProps> = ({ isOpen, onClose, title, subtitle, children, variant = 'default' }) => {
  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[60] transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div 
        className={`fixed top-0 right-0 h-full w-full ${variant === 'large' ? 'max-w-3xl' : 'max-w-xl'} bg-card border-l border-border shadow-2xl z-[70] transition-transform duration-500 ease-out transform ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
          {/* Internal Form Header (Hidden if FormShell is present, but kept for non-refactored drawers) */}
          <div className="px-8 py-5 border-b border-border flex items-center justify-between bg-card">
            <div>
              <h2 className="text-xl font-black tracking-tight">{title}</h2>
              {subtitle && <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em] mt-1">{subtitle}</p>}
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-xl text-muted-foreground transition-all border border-border"
              aria-label="Close panel"
            >
              <X size={18} />
            </button>
          </div>
          
          {/* Content */}
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {children}
          </div>
        </div>
      </div>
    </>
  );
};

export default DetailsDrawer;
