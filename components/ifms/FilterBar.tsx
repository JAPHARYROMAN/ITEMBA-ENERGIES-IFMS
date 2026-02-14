
import React from 'react';
import { Search, SlidersHorizontal, Download, Calendar } from 'lucide-react';

interface FilterBarProps {
  onSearch?: (query: string) => void;
  onExport?: () => void;
  showDate?: boolean;
  onDatePresetChange?: (days: number) => void;
  onToggleFilters?: () => void;
}

const datePresets = [7, 30, 90];

const FilterBar: React.FC<FilterBarProps> = ({
  onSearch,
  onExport,
  showDate = true,
  onDatePresetChange,
  onToggleFilters,
}) => {
  const [presetIndex, setPresetIndex] = React.useState(1);
  const currentDays = datePresets[presetIndex] ?? 30;

  const cycleDatePreset = () => {
    const next = (presetIndex + 1) % datePresets.length;
    setPresetIndex(next);
    onDatePresetChange?.(datePresets[next]);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <div className="relative flex-1 min-w-[240px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input 
          type="text" 
          placeholder="Search..." 
          onChange={(e) => onSearch?.(e.target.value)}
          className="w-full h-10 bg-background border border-input rounded-lg pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary outline-none"
        />
      </div>
      {showDate && (
        <button
          type="button"
          onClick={cycleDatePreset}
          className="h-10 px-3 border border-input rounded-lg flex items-center gap-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          <Calendar size={16} />
          <span>Last {currentDays} Days</span>
        </button>
      )}
      <button
        type="button"
        onClick={onToggleFilters}
        className="h-10 px-3 border border-input rounded-lg flex items-center gap-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
      >
        <SlidersHorizontal size={16} />
        <span>Filters</span>
      </button>
      <button 
        type="button"
        onClick={onExport}
        disabled={!onExport}
        className="h-10 px-3 border border-input rounded-lg flex items-center gap-2 text-sm text-muted-foreground hover:bg-muted transition-colors ml-auto"
      >
        <Download size={16} />
        <span className="hidden sm:inline">Export</span>
      </button>
    </div>
  );
};

export default FilterBar;
