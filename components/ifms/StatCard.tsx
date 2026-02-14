
import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  delta?: string | number;
  trend?: 'up' | 'down' | 'neutral';
  loading?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, delta, trend, loading }) => {
  if (loading) return <StatCardSkeleton />;

  const isUp = trend === 'up';
  const isDown = trend === 'down';

  return (
    <div className="bg-card text-card-foreground p-6 rounded-xl border border-border shadow-sm hover:shadow-md transition-all duration-200" role="status">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className={`p-1.5 rounded-md ${
          isUp ? 'bg-emerald-500/10 text-emerald-600' : 
          isDown ? 'bg-rose-500/10 text-rose-600' : 
          'bg-muted text-muted-foreground'
        }`} aria-hidden="true">
          {isUp ? <TrendingUp size={14} /> : isDown ? <TrendingDown size={14} /> : <Minus size={14} />}
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <h4 className="text-2xl font-black tracking-tight">{value}</h4>
        {delta !== undefined && (
          <span className={`text-xs font-bold ${isUp ? 'text-emerald-700 dark:text-emerald-400' : isDown ? 'text-rose-700 dark:text-rose-400' : 'text-muted-foreground'}`}>
            {isUp && '+'}{delta}%
          </span>
        )}
      </div>
    </div>
  );
};

export const StatCardSkeleton: React.FC = () => (
  <div className="bg-card p-6 rounded-xl border border-border shadow-sm animate-pulse">
    <div className="flex justify-between mb-4">
      <div className="h-3 bg-muted rounded w-1/2"></div>
      <div className="h-6 w-6 bg-muted rounded"></div>
    </div>
    <div className="h-8 bg-muted rounded w-3/4"></div>
  </div>
);

export default StatCard;
