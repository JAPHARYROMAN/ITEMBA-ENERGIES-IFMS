
import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { FinancialMetric } from '../types';

const MetricsCard: React.FC<FinancialMetric> = ({ label, value, change, trend, color }) => {
  const isUp = trend === 'up';
  const isDown = trend === 'down';

  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-slate-500 uppercase tracking-tight">{label}</p>
        <div className={`p-2 rounded-lg bg-${color}-500/10 text-${color}-600 dark:text-${color}-400`}>
          {isUp ? <TrendingUp className="w-4 h-4" /> : isDown ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
        </div>
      </div>
      <div className="flex items-end justify-between">
        <h4 className="text-2xl font-bold tracking-tight">{value}</h4>
        <div className={`flex items-center text-xs font-bold ${isUp ? 'text-emerald-600' : isDown ? 'text-rose-600' : 'text-slate-500'}`}>
          {isUp && '+'}
          {change}%
        </div>
      </div>
      <div className="mt-4 h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div 
          className={`h-full bg-${color}-500 transition-all duration-1000 ease-out`} 
          style={{ width: `${Math.min(Math.abs(change) * 5, 100)}%` }}
        ></div>
      </div>
    </div>
  );
};

export default MetricsCard;
