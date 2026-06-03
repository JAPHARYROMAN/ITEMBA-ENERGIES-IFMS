import React from 'react';
import { describe, test, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomerForm } from './CustomerForm';

afterEach(cleanup);

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSuccess = vi.fn();
  const onCancel = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <CustomerForm onSuccess={onSuccess} onCancel={onCancel} />
    </QueryClientProvider>,
  );
  return { onSuccess, onCancel };
}

describe('CustomerForm', () => {
  test('renders core fields and seeds default credit limit', () => {
    renderForm();
    expect(screen.getByLabelText(/Legal Business Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Billing Email/i)).toBeInTheDocument();
    // creditLimit default value 5000 from useForm defaultValues
    expect(screen.getByLabelText(/Credit Exposure Limit/i)).toHaveValue(5000);
  });

  test('submit button is disabled until the form is dirty', () => {
    renderForm();
    const submit = screen.getByRole('button', { name: /Authorize Account/i });
    expect(submit).toBeDisabled();
  });

  test('surfaces zod min-length error for the business name', async () => {
    renderForm();
    const nameInput = screen.getByLabelText(/Legal Business Name/i);
    // make the form dirty + invalid (under 3 chars)
    fireEvent.change(nameInput, { target: { value: 'ab' } });
    const submit = screen.getByRole('button', { name: /Authorize Account/i });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    expect(
      await screen.findByText(/Name must be at least 3 characters/i),
    ).toBeInTheDocument();
  });

  test('Cancel triggers onCancel callback', () => {
    const { onCancel } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
