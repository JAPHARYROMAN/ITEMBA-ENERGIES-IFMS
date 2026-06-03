import React from 'react';
import { describe, test, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdjustmentForm } from './AdjustmentForm';

afterEach(cleanup);

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSuccess = vi.fn();
  const onCancel = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <AdjustmentForm onSuccess={onSuccess} onCancel={onCancel} />
    </QueryClientProvider>,
  );
  return { onSuccess, onCancel };
}

describe('AdjustmentForm', () => {
  test('renders tank, volume delta, reason select, and notes', () => {
    renderForm();
    expect(screen.getByText('Tank')).toBeInTheDocument();
    expect(screen.getByText(/Volume Delta/i)).toBeInTheDocument();
    expect(screen.getByText('Reason')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    // reason select offers known options
    expect(screen.getByRole('option', { name: 'Spillage' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Theft' })).toBeInTheDocument();
  });

  test('surfaces required errors for tank, volume, and reason on empty submit', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /Submit Adjustment/i }));
    await waitFor(() => expect(screen.getAllByText('Required').length).toBeGreaterThanOrEqual(3));
  });

  test('Cancel button triggers onCancel', () => {
    const { onCancel } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
