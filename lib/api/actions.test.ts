import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from './client';
import { postReportAction, addCustomerNote, postCustomerAction } from './actions';

const apiFetchMock = vi.mocked(apiFetch);

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({} as never);
});

describe('postReportAction', () => {
  test('POSTs action with targetId and payload', async () => {
    await postReportAction('classify-loss', { targetId: 't1', payload: { code: 'X' } });
    expect(apiFetchMock).toHaveBeenCalledWith('reports/actions', {
      method: 'POST',
      body: { action: 'classify-loss', targetId: 't1', payload: { code: 'X' } },
    });
  });

  test('POSTs action with undefined target/payload when omitted', async () => {
    await postReportAction('bulk-reminders');
    expect(apiFetchMock).toHaveBeenCalledWith('reports/actions', {
      method: 'POST',
      body: { action: 'bulk-reminders', targetId: undefined, payload: undefined },
    });
  });
});

describe('addCustomerNote', () => {
  test('POSTs a note to the customer notes endpoint', async () => {
    await addCustomerNote('cust-1', 'called the customer');
    expect(apiFetchMock).toHaveBeenCalledWith('customers/cust-1/notes', {
      method: 'POST',
      body: { note: 'called the customer' },
    });
  });
});

describe('postCustomerAction', () => {
  test('POSTs a customer action with payload', async () => {
    await postCustomerAction('cust-1', 'send-payment-link', { amount: 100 });
    expect(apiFetchMock).toHaveBeenCalledWith('customers/cust-1/actions', {
      method: 'POST',
      body: { action: 'send-payment-link', payload: { amount: 100 } },
    });
  });

  test('POSTs a customer action with undefined payload when omitted', async () => {
    await postCustomerAction('cust-1', 'escalate-legal');
    expect(apiFetchMock).toHaveBeenCalledWith('customers/cust-1/actions', {
      method: 'POST',
      body: { action: 'escalate-legal', payload: undefined },
    });
  });
});
