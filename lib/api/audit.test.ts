import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from './client';
import { fetchAuditLogs } from './audit';

const apiFetchMock = vi.mocked(apiFetch);

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 } as never);
});

describe('fetchAuditLogs', () => {
  test('builds an empty query string when no params given', async () => {
    await fetchAuditLogs({});
    expect(apiFetchMock).toHaveBeenCalledWith('audit/logs?');
  });

  test('includes only the provided params', async () => {
    await fetchAuditLogs({ page: 2, pageSize: 50, entity: 'shift', action: 'update' });
    expect(apiFetchMock).toHaveBeenCalledWith('audit/logs?page=2&pageSize=50&entity=shift&action=update');
  });

  test('passes through date and actor filters', async () => {
    await fetchAuditLogs({ actorUserId: 'u1', dateFrom: '2026-01-01', dateTo: '2026-02-01' });
    expect(apiFetchMock).toHaveBeenCalledWith(
      'audit/logs?actorUserId=u1&dateFrom=2026-01-01&dateTo=2026-02-01',
    );
  });

  test('drops page=0 because it is falsy (not appended)', async () => {
    await fetchAuditLogs({ page: 0, entity: 'shift' });
    expect(apiFetchMock).toHaveBeenCalledWith('audit/logs?entity=shift');
  });
});
