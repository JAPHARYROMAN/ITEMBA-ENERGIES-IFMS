import React from 'react';
import { describe, test, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { MeterReadingsGrid } from './MeterReadingsGrid';

afterEach(cleanup);

function Harness({ readings }: { readings?: Record<string, unknown>[] }) {
  const methods = useForm({
    defaultValues: {
      readings: readings ?? [
        { nozzleLabel: 'Pump 1-A', opening: 100, closing: 150 },
        { nozzleLabel: 'Pump 1-B', opening: 0, closing: 0 },
      ],
    },
  });
  return (
    <FormProvider {...methods}>
      <MeterReadingsGrid name="readings" />
    </FormProvider>
  );
}

describe('MeterReadingsGrid', () => {
  test('renders a row per nozzle with its label', () => {
    render(<Harness />);
    // labels appear in both desktop and mobile layouts
    expect(screen.getAllByText('Pump 1-A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pump 1-B').length).toBeGreaterThan(0);
  });

  test('computes delta (closing - opening) per row', () => {
    render(<Harness />);
    // Row 1: 150 - 100 = 50.000
    expect(screen.getAllByText('50.000').length).toBeGreaterThan(0);
    // Row 2: 0 - 0 = 0.000
    expect(screen.getAllByText('0.000').length).toBeGreaterThan(0);
  });

  test('recomputes delta live as closing value changes', () => {
    render(<Harness readings={[{ nozzleLabel: 'N1', opening: 10, closing: 10 }]} />);
    expect(screen.getAllByText('0.000').length).toBeGreaterThan(0);
    // spinbutton order: opening(desktop), closing(desktop), opening(mobile), closing(mobile)
    // both closing inputs register to the same field; RHF keeps the last-mounted ref
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[1], { target: { value: '35' } });
    fireEvent.change(inputs[3], { target: { value: '35' } });
    // delta = 35 - 10 = 25.000
    expect(screen.getAllByText('25.000').length).toBeGreaterThan(0);
  });

  test('Enter key moves focus off the current opening cell', () => {
    render(<Harness />);
    // desktop row0 opening = inputs[0]
    const row0Opening = screen.getAllByRole('spinbutton')[0];
    row0Opening.focus();
    expect(row0Opening).toHaveFocus();
    fireEvent.keyDown(row0Opening, { key: 'Enter' });
    // keyboard nav focuses the next row's opening cell
    expect(row0Opening).not.toHaveFocus();
  });
});
