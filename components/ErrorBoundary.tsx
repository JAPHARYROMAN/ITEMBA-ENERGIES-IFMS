import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  declare props: Props;

  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-rose-500/10 text-rose-600 rounded-3xl border border-rose-500/20 shadow-xl">
              <AlertTriangle size={40} />
            </div>
            
            <div>
              <h1 className="text-2xl font-black tracking-tight text-foreground">System Anomaly Detected</h1>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                The enterprise core encountered an unexpected termination. All financial states have been safely cached.
              </p>
            </div>

            <div className="p-4 bg-muted/30 rounded-2xl border border-border text-left overflow-hidden">
               <p className="text-[10px] font-black uppercase text-muted-foreground mb-1 tracking-widest">Technical Log</p>
               <p className="text-[11px] font-mono text-rose-600 truncate">{this.state.error?.message}</p>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => window.location.reload()}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 transition-all"
              >
                <RefreshCcw size={16} />
                Hard Refresh
              </button>
              <button 
                onClick={() => window.location.href = '/'}
                className="px-4 py-3 bg-card border border-border text-foreground font-bold rounded-xl hover:bg-muted transition-all"
              >
                <Home size={16} />
              </button>
            </div>

            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-[0.2em] pt-4">IFMS Resilience Engine v2.5</p>
          </div>
        </div>
      );
    }

    // Fix: Accessing children through this.props.children instead of this.children in a class component
    return this.props.children;
  }
}
