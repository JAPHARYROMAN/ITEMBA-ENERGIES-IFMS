import React from 'react';
import { describe, test, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExpenseCategoryForm } from './ExpenseCategoryForm';

afterEach(cleanup);

function renderForm(props?: Partial<{ onSuccess: () => void; onCancel: () => void }>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSuccess = props?.onSuccess ?? vi.fn();
  const onCancel = props?.onCancel ?? vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ExpenseCategoryForm onSuccess={onSuccess} onCancel={onCancel} />
    </QueryClientProvider>,
  );
  return { onSuccess, onCancel };
}

describe('ExpenseCategoryForm', () => {
  test('renders code, name, and description fields', () => {
    renderForm();
    expect(screen.getByText('Code')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText(/Description/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Category/i })).toBeInTheDocument();
  });

  test('shows required validation errors when submitting empty', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /Create Category/i }));
    // both Code and Name are required -> two "Required" messages
    await waitFor(() => expect(screen.getAllByText('Required').length).toBeGreaterThanOrEqual(2));
  });

  test('Cancel invokes onCancel without submitting', () => {
    const { onCancel } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
