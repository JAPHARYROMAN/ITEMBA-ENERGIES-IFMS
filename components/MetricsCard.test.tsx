import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MetricsCard from './MetricsCard';

describe('MetricsCard', () => {
  test('renders label and value', () => {
    render(
      <MetricsCard
        label="Revenue"
        value="TZS 5,000,000"
        change={12.5}
        trend="up"
        color="emerald"
      />,
    );
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('TZS 5,000,000')).toBeInTheDocument();
  });

  test('shows positive change with + prefix for up trend', () => {
    render(
      <MetricsCard label="Profit" value="TZS 1,000,000" change={8.4} trend="up" color="blue" />,
    );
    expect(screen.getByText('+8.4%')).toBeInTheDocument();
  });

  test('shows negative change without + for down trend', () => {
    render(
      <MetricsCard
        label="Expenses"
        value="TZS 2,000,000"
        change={-3.2}
        trend="down"
        color="rose"
      />,
    );
    expect(screen.getByText('-3.2%')).toBeInTheDocument();
  });

  test('handles neutral trend', () => {
    render(<MetricsCard label="Balance" value="TZS 0" change={0} trend="neutral" color="slate" />);
    expect(screen.getByText('Balance')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});
