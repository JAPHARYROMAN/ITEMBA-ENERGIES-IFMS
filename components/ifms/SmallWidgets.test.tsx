import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import FilterBar from './FilterBar';
import StatCard from './StatCard';
import {
  ChartSkeleton,
  DashboardSkeleton,
  NotificationSkeleton,
  TableSkeleton,
} from './Skeletons';

describe('small IFMS widgets', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test('FilterBar calls optional handlers and cycles date presets', () => {
    const onSearch = vi.fn();
    const onExport = vi.fn();
    const onDatePresetChange = vi.fn();
    const onToggleFilters = vi.fn();

    render(
      <FilterBar
        onSearch={onSearch}
        onExport={onExport}
        onDatePresetChange={onDatePresetChange}
        onToggleFilters={onToggleFilters}
      />,
    );

    fireEvent.change(screen.getByLabelText('Search records'), {
      target: { value: 'diesel' },
    });
    expect(onSearch).toHaveBeenCalledWith('diesel');

    fireEvent.click(screen.getByLabelText('Last 30 Days'));
    expect(onDatePresetChange).toHaveBeenCalledWith(90);
    expect(screen.getByLabelText('Last 90 Days')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Toggle filters'));
    expect(onToggleFilters).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Export data'));
    expect(onExport).toHaveBeenCalled();
  });

  test('FilterBar hides date controls and disables export when handlers are omitted', () => {
    render(<FilterBar showDate={false} />);

    expect(screen.queryByLabelText(/Last \d+ days/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Export data')).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Search records'), {
      target: { value: 'ignored without callback' },
    });
    fireEvent.click(screen.getByLabelText('Toggle filters'));
  });

  test('StatCard renders loading, up, down, neutral, and omitted-delta variants', () => {
    const { rerender, container } = render(
      <StatCard label="Revenue" value="TZS 1,000" trend="up" delta={12} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Revenue');
    expect(screen.getByText('+12%')).toBeInTheDocument();

    rerender(<StatCard label="Expenses" value="TZS 400" trend="down" delta={-3} />);
    expect(screen.getByText('-3%')).toBeInTheDocument();

    rerender(<StatCard label="Liquidity" value="TZS 600" trend="neutral" delta={0} />);
    expect(screen.getByText('0%')).toBeInTheDocument();

    rerender(<StatCard label="No Delta" value="TZS 200" />);
    expect(screen.queryByText('%')).not.toBeInTheDocument();

    rerender(<StatCard label="Loading" value="TZS 0" loading />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  test('skeleton components render their expected placeholder counts', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { rerender, container } = render(<ChartSkeleton />);

    expect(container.querySelectorAll('[style*="height: 50%"]')).toHaveLength(8);

    rerender(<TableSkeleton />);
    expect(container.querySelectorAll('.h-14')).toHaveLength(5);

    rerender(<DashboardSkeleton />);
    expect(container.querySelectorAll('.h-28')).toHaveLength(4);
    expect(container.querySelectorAll('.h-96')).toHaveLength(2);

    rerender(<NotificationSkeleton />);
    expect(container.querySelectorAll('.p-4.border')).toHaveLength(5);
  });
});
