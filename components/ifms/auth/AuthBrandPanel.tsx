import React from 'react';
import { ShieldCheck, Fuel, BarChart3 } from 'lucide-react';

interface AuthBrandPanelProps {
  demoMode?: boolean;
}

const trustItems = [
  {
    icon: ShieldCheck,
    text: 'Shift reconciliation & variance control',
  },
  {
    icon: Fuel,
    text: 'Stock loss intelligence & audit trails',
  },
  {
    icon: BarChart3,
    text: 'Executive reporting across branches',
  },
];

export const AuthBrandPanel: React.FC<AuthBrandPanelProps> = ({ demoMode = false }) => {
  return (
    <div className="flex h-full flex-col justify-between rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8 lg:p-10">
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-muted-foreground">ITEMBA-ENERGIES IFMS</p>
          <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">Enterprise fuel operations & intelligence</h1>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Unified workflows for station operations, financial control, and enterprise-grade decision support.
          </p>
        </div>

        <ul className="space-y-3" aria-label="Platform capabilities">
          {trustItems.map((item) => (
            <li key={item.text} className="flex items-start gap-3 rounded-xl border border-border bg-background/60 p-3">
              <item.icon className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-sm font-semibold text-foreground">{item.text}</span>
            </li>
          ))}
        </ul>
      </div>

      {demoMode ? (
        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300">
          DEMO MODE: You are viewing a sandbox environment with non-production data.
        </div>
      ) : null}
    </div>
  );
};
