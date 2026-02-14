import { apiFetch } from './client';

export type ReportAction =
  | 'request-physical-audit'
  | 'classify-loss'
  | 'update-inventory-journals'
  | 'approve-shift-audit'
  | 'flag-shift-audit'
  | 'bulk-reminders'
  | 'send-payment-link'
  | 'escalate-legal'
  | 'run-sensitivity-simulation';

export function postReportAction(
  action: ReportAction,
  payload?: { targetId?: string; payload?: Record<string, unknown> },
) {
  return apiFetch('reports/actions', {
    method: 'POST',
    body: {
      action,
      targetId: payload?.targetId,
      payload: payload?.payload,
    },
  });
}

export function addCustomerNote(customerId: string, note: string) {
  return apiFetch(`customers/${customerId}/notes`, {
    method: 'POST',
    body: { note },
  });
}

export type CustomerAction = 'bulk-reminder' | 'send-payment-link' | 'escalate-legal';

export function postCustomerAction(
  customerId: string,
  action: CustomerAction,
  payload?: Record<string, unknown>,
) {
  return apiFetch(`customers/${customerId}/actions`, {
    method: 'POST',
    body: { action, payload },
  });
}

