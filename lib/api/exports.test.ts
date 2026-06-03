import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock apiFetch (used by create/list/getById) and the token getter (used by
// download via raw fetch). normalizeError keeps its real implementation.
vi.mock('./client', async () => {
  const actual = await vi.importActual<typeof import('./client')>('./client');
  return {
    ...actual,
    apiFetch: vi.fn(),
    getAccessToken: vi.fn(),
  };
});

import { apiFetch, getAccessToken } from './client';
import { apiExports, type ExportRecord } from './exports';

const apiFetchMock = vi.mocked(apiFetch);
const getAccessTokenMock = vi.mocked(getAccessToken);

const BASE = 'http://localhost:3001';

function makeRecord(overrides: Partial<ExportRecord> = {}): ExportRecord {
  return {
    id: 'exp-1',
    companyId: 'c1',
    branchId: null,
    userId: 'u1',
    exportType: 'reports.overview',
    format: 'pdf',
    params: {},
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 10,
    sha256Hash: null,
    verificationToken: 'vt-1',
    status: 'ready',
    createdAt: '2026-01-01',
    completedAt: null,
    expiresAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({} as never);
  getAccessTokenMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('apiExports simple wrappers', () => {
  test('create POSTs the payload to exports', async () => {
    const payload = { format: 'pdf' as const, exportType: 'reports.overview' as const };
    await apiExports.create(payload);
    expect(apiFetchMock).toHaveBeenCalledWith('exports', { method: 'POST', body: payload });
  });

  test('list GETs exports with the default limit', async () => {
    await apiExports.list();
    expect(apiFetchMock).toHaveBeenCalledWith('exports?limit=50');
  });

  test('list honors a custom limit', async () => {
    await apiExports.list(5);
    expect(apiFetchMock).toHaveBeenCalledWith('exports?limit=5');
  });

  test('getById GETs exports/:id', async () => {
    await apiExports.getById('exp-9');
    expect(apiFetchMock).toHaveBeenCalledWith('exports/exp-9');
  });
});

describe('apiExports verification URLs', () => {
  test('verifyUrl appends the token', () => {
    expect(apiExports.verifyUrl('tok')).toBe(
      'https://www.itembagroup.llc/public/report/verify?token=tok',
    );
  });

  test('publicReceiptUrl points at the receipt sub-path', () => {
    expect(apiExports.publicReceiptUrl('tok')).toBe(
      'https://www.itembagroup.llc/public/report/verify/receipt?token=tok',
    );
  });
});

describe('apiExports.download (raw fetch + DOM)', () => {
  test('fetches the download URL with the bearer token and triggers an anchor click', async () => {
    getAccessTokenMock.mockReturnValue('tok-123');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['data'], { type: 'application/pdf' }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await apiExports.download(makeRecord());

    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/api/exports/exp-1/download`, {
      method: 'GET',
      credentials: 'include',
      headers: { Authorization: 'Bearer tok-123' },
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test('throws a normalized ApiError when the download response is not ok', async () => {
    getAccessTokenMock.mockReturnValue(null);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ message: 'Export not found' }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiExports.download(makeRecord())).rejects.toMatchObject({
      message: 'Export not found',
      statusCode: 404,
    });
    // no Authorization header when there is no token
    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined();
  });

  test('downloadVerificationReceipt requests the receipt endpoint', async () => {
    getAccessTokenMock.mockReturnValue('tok-123');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['data']),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await apiExports.downloadVerificationReceipt(makeRecord());

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/exports/exp-1/verification-receipt`);
  });
});
