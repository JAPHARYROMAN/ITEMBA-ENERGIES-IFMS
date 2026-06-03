import React from 'react';
import { describe, test, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { AllocationEditor } from './AllocationEditor';

afterEach(cleanup);

const tanks = [
  { id: 't1', label: 'Tank Alpha', capacity: 1000, currentLevel: 200 },
  { id: 't2', label: 'Tank Beta', capacity: 500, currentLevel: 100 },
];

function Harness({
  totalQty = 1000,
  defaultAllocations,
}: {
  totalQty?: number;
  defaultAllocations?: Record<string, unknown>[];
}) {
  const methods = useForm({
    defaultValues: { allocations: defaultAllocations ?? [] },
  });
  return (
    <FormProvider {...methods}>
      <AllocationEditor name="allocations" totalQty={totalQty} tanks={tanks} />
    </FormProvider>
  );
}

describe('AllocationEditor', () => {
  test('renders a row per tank with available volume (capacity - level)', () => {
    render(<Harness />);
    // labels render in both desktop table + mobile fallback under jsdom
    expect(screen.getAllByText('Tank Alpha').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tank Beta').length).toBeGreaterThan(0);
    // available = 1000-200=800 and 500-100=400 (desktop "Available" column)
    expect(screen.getByText('800')).toBeInTheDocument();
    expect(screen.getByText('400')).toBeInTheDocument();
  });

  test('shows total received in summary', () => {
    render(<Harness totalQty={1000} />);
    expect(screen.getByText('1,000 L')).toBeInTheDocument();
  });

  test('balanced allocation hides the warning banner', () => {
    render(
      <Harness
        totalQty={1000}
        defaultAllocations={[
          { tankId: 't1', qty: 600 },
          { tankId: 't2', qty: 400 },
        ]}
      />,
    );
    expect(screen.queryByText(/still unallocated/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Over-allocated/i)).not.toBeInTheDocument();
  });

  test('shows unallocated warning when short', () => {
    render(
      <Harness totalQty={1000} defaultAllocations={[{ tankId: 't1', qty: 600 }]} />,
    );
    expect(screen.getByText(/400\.0 L still unallocated/i)).toBeInTheDocument();
  });

  test('typing into an allocate cell updates remaining', async () => {
    render(
      <Harness
        totalQty={1000}
        defaultAllocations={[
          { tankId: 't1', qty: 0 },
          { tankId: 't2', qty: 0 },
        ]}
      />,
    );
    expect(screen.getByText(/1000\.0 L still unallocated/i)).toBeInTheDocument();
    // tank 1 has a desktop + mobile input bound to allocations.0.qty; RHF binds its
    // change handler to the last-mounted (mobile) input. spinbutton order:
    // [t1-desktop, t2-desktop, t1-mobile, t2-mobile] -> tank 1 mobile is index 2.
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[2], { target: { value: '300' } });
    await waitFor(() =>
      expect(screen.getByText(/700\.0 L still unallocated/i)).toBeInTheDocument(),
    );
  });
});
