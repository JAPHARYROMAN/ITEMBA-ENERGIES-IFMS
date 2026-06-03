import React from 'react';
import { describe, test, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { PaymentSplitEditor } from './PaymentSplitEditor';

afterEach(cleanup);

function Harness({
  totalDue = 100,
  defaultSplits,
}: {
  totalDue?: number;
  defaultSplits?: Record<string, unknown>[];
}) {
  const methods = useForm({ defaultValues: { splits: defaultSplits ?? [] } });
  return (
    <FormProvider {...methods}>
      <PaymentSplitEditor name="splits" totalDue={totalDue} />
    </FormProvider>
  );
}

describe('PaymentSplitEditor', () => {
  test('renders summary with total due and empty state', () => {
    render(<Harness totalDue={100} />);
    expect(screen.getByText(/No payment methods added/i)).toBeInTheDocument();
    expect(screen.getByText('Total Due')).toBeInTheDocument();
    // Total Due $100.00 and Remaining $100.00 both shown when nothing allocated
    expect(screen.getAllByText('$100.00').length).toBeGreaterThanOrEqual(1);
  });

  test('Add Method appends a method/amount/reference row', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Add Method/i }));
    expect(screen.queryByText(/No payment methods added/i)).not.toBeInTheDocument();
    expect(screen.getByText('Method')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('Reference')).toBeInTheDocument();
  });

  test('computes allocated and remaining, and flags balanced state', () => {
    render(
      <Harness
        totalDue={100}
        defaultSplits={[{ method: 'cash', amount: 100, reference: '' }]}
      />,
    );
    expect(screen.getByText('Allocated')).toBeInTheDocument();
    // remaining = 0 -> balanced, no warning banner
    expect(screen.queryByText(/still unallocated/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Over-allocated/i)).not.toBeInTheDocument();
  });

  test('shows unallocated warning when allocation is short', () => {
    render(
      <Harness
        totalDue={100}
        defaultSplits={[{ method: 'cash', amount: 40, reference: '' }]}
      />,
    );
    expect(screen.getByText(/\$60\.00 still unallocated/i)).toBeInTheDocument();
  });

  test('shows over-allocated warning when allocation exceeds total', () => {
    render(
      <Harness
        totalDue={100}
        defaultSplits={[{ method: 'cash', amount: 130, reference: '' }]}
      />,
    );
    expect(screen.getByText(/Over-allocated by \$30\.00/i)).toBeInTheDocument();
  });

  test('editing an amount recomputes the remaining warning', () => {
    render(
      <Harness
        totalDue={100}
        defaultSplits={[{ method: 'cash', amount: 40, reference: '' }]}
      />,
    );
    expect(screen.getByText(/\$60\.00 still unallocated/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '70' } });
    expect(screen.getByText(/\$30\.00 still unallocated/i)).toBeInTheDocument();
  });

  test('removing the only row returns to empty state', () => {
    render(<Harness defaultSplits={[{ method: 'cash', amount: 10, reference: '' }]} />);
    fireEvent.click(screen.getByTitle('Remove'));
    expect(screen.getByText(/No payment methods added/i)).toBeInTheDocument();
  });
});
