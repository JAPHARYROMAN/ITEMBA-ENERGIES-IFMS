import React from 'react';
import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomerForm } from './CustomerForm';

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  customerCreate: vi.fn(),
}));

vi.mock('../../store', async (importActual) => {
  const actual = await importActual<typeof import('../../store')>();
  return {
    ...actual,
    useAppStore: () => ({ addToast: mocks.addToast }),
    useAuthStore: () => ({
      user: {
        id: 'user-1',
        name: 'Credit Manager',
        email: 'credit@example.com',
        role: 'manager',
        permissions: ['credit:write'],
      },
    }),
  };
});

vi.mock('../../lib/repositories', () => ({
  customerRepo: {
    create: mocks.customerCreate,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.customerCreate.mockResolvedValue({ id: 'cust-created' });
});

afterEach(cleanup);

function renderForm() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const onSuccess = vi.fn();
  const onCancel = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <CustomerForm onSuccess={onSuccess} onCancel={onCancel} />
    </QueryClientProvider>,
  );
  return { onSuccess, onCancel };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
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

  test('normalizes optional fields and creates a suspended COD customer', async () => {
    const { onSuccess } = renderForm();

    fireEvent.change(screen.getByLabelText(/Legal Business Name/i), {
      target: { value: 'Acme Fleet Services' },
    });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), {
      target: { value: '+254 555 0100' },
    });
    fireEvent.change(screen.getByLabelText(/Tax ID/i), { target: { value: 'VAT-123' } });
    fireEvent.change(screen.getByLabelText(/Credit Exposure Limit/i), {
      target: { value: '2500' },
    });
    fireEvent.change(screen.getByLabelText(/Payment Terms/i), { target: { value: 'cod' } });
    fireEvent.change(screen.getByLabelText(/Account Status/i), {
      target: { value: 'suspended' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Authorize Account/i }));

    await waitFor(() =>
      expect(mocks.customerCreate).toHaveBeenCalledWith({
        name: 'Acme Fleet Services',
        email: undefined,
        phone: '+254 555 0100',
        address: undefined,
        taxId: 'VAT-123',
        creditLimit: 2500,
        paymentTerms: 'cod',
        status: 'suspended',
      }),
    );
    expect(mocks.addToast).toHaveBeenCalledWith('Customer saved successfully', 'success');
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('reports invalid email and negative credit limit without calling the repository', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/Legal Business Name/i), {
      target: { value: 'Acme Fleet Services' },
    });
    fireEvent.change(screen.getByLabelText(/Billing Email/i), {
      target: { value: 'not-an-email' },
    });
    fireEvent.change(screen.getByLabelText(/Credit Exposure Limit/i), {
      target: { value: '-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Authorize Account/i }));

    expect(await screen.findByText(/Invalid email/i)).toBeInTheDocument();
    expect(screen.getByText(/Limit cannot be negative/i)).toBeInTheDocument();
    expect(mocks.customerCreate).not.toHaveBeenCalled();
  });

  test('shows loading state while create is pending', async () => {
    const pending = deferred<{ id: string }>();
    mocks.customerCreate.mockReturnValueOnce(pending.promise);
    renderForm();

    fireEvent.change(screen.getByLabelText(/Legal Business Name/i), {
      target: { value: 'Pending Account Ltd' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Authorize Account/i }));

    expect(await screen.findByText(/Syncing/i)).toBeInTheDocument();
    pending.resolve({ id: 'cust-pending' });
  });

  test('surfaces repository failure and does not complete the form', async () => {
    mocks.customerCreate.mockRejectedValueOnce({
      apiError: { message: 'Credit registry offline' },
    });
    const { onSuccess } = renderForm();

    fireEvent.change(screen.getByLabelText(/Legal Business Name/i), {
      target: { value: 'Blocked Account Ltd' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Authorize Account/i }));

    await waitFor(() =>
      expect(mocks.addToast).toHaveBeenCalledWith('Credit registry offline', 'error'),
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test('Cancel triggers onCancel callback', () => {
    const { onCancel } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
