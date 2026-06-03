import React from 'react';
import { describe, test, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { LineItemsEditor } from './LineItemsEditor';

afterEach(cleanup);

const columns = [
  { name: 'description', label: 'Description', type: 'text' as const },
  { name: 'amount', label: 'Amount', type: 'number' as const, step: '0.01' },
];

function Harness({ defaultRows }: { defaultRows?: Record<string, unknown>[] }) {
  const methods = useForm({ defaultValues: { items: defaultRows ?? [] } });
  return (
    <FormProvider {...methods}>
      <LineItemsEditor
        name="items"
        columns={columns}
        defaultRow={{ description: '', amount: 0 }}
        totalField="amount"
        totalLabel="Grand Total"
      />
    </FormProvider>
  );
}

describe('LineItemsEditor', () => {
  test('renders empty state and line count label', () => {
    render(<Harness />);
    // empty message appears in both desktop table + mobile fallback (jsdom has no
    // viewport-based CSS so both layouts mount)
    expect(screen.getAllByText(/No items added/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Line Count')).toBeInTheDocument();
  });

  test('Add Row appends an editable row', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Add Row/i }));
    expect(screen.queryByText(/No items added/i)).not.toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    // header + at least 1 data row
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  test('removing a row drops it back to empty state', () => {
    render(<Harness defaultRows={[{ description: 'A', amount: 5 }]} />);
    expect(screen.queryByText(/No items added/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByTitle('Remove row')[0]);
    expect(screen.getAllByText(/No items added/i).length).toBeGreaterThan(0);
  });

  test('computes grand total from totalField across rows', () => {
    render(
      <Harness
        defaultRows={[
          { description: 'A', amount: 10 },
          { description: 'B', amount: 15.5 },
        ]}
      />,
    );
    expect(screen.getByText('$25.50')).toBeInTheDocument();
  });

  test('typing a number into an amount cell updates the grand total', async () => {
    render(<Harness defaultRows={[{ description: 'A', amount: 0 }]} />);
    // The desktop table and mobile fallback both register an input for
    // items.0.amount; RHF binds its change handler to the last-mounted (mobile)
    // input, so drive the change there.
    const amountInputs = screen.getAllByRole('spinbutton');
    fireEvent.change(amountInputs[amountInputs.length - 1], { target: { value: '40' } });
    await waitFor(() => expect(screen.getByText('$40.00')).toBeInTheDocument());
  });
});
