import { apiFetch } from './client';

export interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface ListResponse<T> {
  data: T[];
  meta: ListMeta;
}

const MAX_LIST_PAGE_SIZE = 100;

async function listAll<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T[]> {
  const requestedPageSize = Number(params?.pageSize ?? MAX_LIST_PAGE_SIZE);
  const safePageSize = Number.isFinite(requestedPageSize) && requestedPageSize > 0
    ? Math.min(MAX_LIST_PAGE_SIZE, Math.trunc(requestedPageSize))
    : MAX_LIST_PAGE_SIZE;
  const rows: T[] = [];
  let page = 1;

  while (true) {
    const search = new URLSearchParams();
    search.set('page', String(page));
    search.set('pageSize', String(safePageSize));
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (k === 'page' || k === 'pageSize') return;
        if (v !== undefined && v !== '') search.set(k, String(v));
      });
    }

    const res = await apiFetch<ListResponse<T>>(`${path}?${search.toString()}`);
    const pageRows = res.data ?? [];
    rows.push(...pageRows);

    const total = res.meta?.total ?? pageRows.length;
    if (pageRows.length === 0 || rows.length >= total || pageRows.length < safePageSize) {
      return rows;
    }

    page += 1;
  }
}

export const apiSetup = {
  companies: {
    list: () => listAll<{ id: string; name: string; code: string; currency: string; status: string }>('companies'),
    create: (body: { code: string; name: string; currency?: string; status?: string }) =>
      apiFetch<{ id: string; name: string; code: string; currency: string; status: string }>('companies', {
        method: 'POST',
        body,
      }),
    update: (id: string, body: { code?: string; name?: string; currency?: string; status?: string }) =>
      apiFetch<{ id: string; name: string; code: string; currency: string; status: string }>(`companies/${id}`, {
        method: 'PATCH',
        body,
      }),
    delete: (id: string) => apiFetch<void>(`companies/${id}`, { method: 'DELETE' }),
  },
  stations: {
    list: () => listAll<{ id: string; companyId: string; name: string; location: string; manager: string }>('stations'),
    create: (body: {
      companyId: string;
      code: string;
      name: string;
      location?: string;
      manager?: string;
      status?: string;
    }) =>
      apiFetch<{ id: string; companyId: string; name: string; code: string; location: string; manager: string; status: string }>('stations', {
        method: 'POST',
        body,
      }),
    update: (id: string, body: {
      companyId?: string;
      code?: string;
      name?: string;
      location?: string;
      manager?: string;
      status?: string;
    }) =>
      apiFetch<{ id: string; companyId: string; name: string; code: string; location: string; manager: string; status: string }>(`stations/${id}`, {
        method: 'PATCH',
        body,
      }),
    delete: (id: string) => apiFetch<void>(`stations/${id}`, { method: 'DELETE' }),
  },
  branches: {
    list: (stationId?: string) =>
      listAll<{ id: string; stationId: string; name: string }>('branches', stationId ? { stationId } : undefined),
    create: (body: { stationId: string; code: string; name: string; status?: string }) =>
      apiFetch<{ id: string; stationId: string; code: string; name: string; status: string }>('branches', {
        method: 'POST',
        body,
      }),
    update: (id: string, body: { stationId?: string; code?: string; name?: string; status?: string }) =>
      apiFetch<{ id: string; stationId: string; code: string; name: string; status: string }>(`branches/${id}`, {
        method: 'PATCH',
        body,
      }),
    delete: (id: string) => apiFetch<void>(`branches/${id}`, { method: 'DELETE' }),
  },
  products: {
    list: () =>
      listAll<{
        id: string;
        companyId: string;
        code: string;
        name: string;
        category: string;
        pricePerUnit: string | number;
        unit: string;
        status: string;
      }>('products'),
    create: (body: {
      companyId: string;
      code: string;
      name: string;
      category: string;
      pricePerUnit: number;
      unit?: string;
      status?: string;
    }) =>
      apiFetch<{ id: string; companyId: string; code: string; name: string; category: string; pricePerUnit: string; unit: string; status: string }>(
        'products',
        { method: 'POST', body }
      ),
    delete: (id: string) => apiFetch<void>(`products/${id}`, { method: 'DELETE' }),
  },
  tanks: {
    list: (stationId?: string) =>
      listAll<{
        id: string;
        companyId: string;
        branchId: string;
        productId: string | null;
        code: string;
        capacity: string | number;
        minLevel: string | number;
        maxLevel: string | number;
        currentLevel: string | number;
        calibrationProfile: string | null;
        status: string;
      }>('tanks', stationId ? { stationId } : undefined).then((rows) =>
        rows.map((r) => ({
          ...r,
          stationId: (r as { stationId?: string }).stationId ?? '',
          capacity: typeof r.capacity === 'string' ? Number(r.capacity) : r.capacity,
          minLevel: typeof r.minLevel === 'string' ? Number(r.minLevel) : r.minLevel,
          maxLevel: typeof r.maxLevel === 'string' ? Number(r.maxLevel) : r.maxLevel,
          currentLevel: typeof r.currentLevel === 'string' ? Number(r.currentLevel) : r.currentLevel,
        }))
      ),
    create: (body: {
      companyId: string;
      branchId: string;
      productId?: string;
      code: string;
      capacity: number;
      minLevel?: number;
      maxLevel?: number;
      currentLevel?: number;
      calibrationProfile?: string;
      status?: string;
    }) =>
      apiFetch<{
        id: string;
        companyId: string;
        branchId: string;
        productId: string | null;
        code: string;
        capacity: string;
        minLevel: string;
        maxLevel: string;
        currentLevel: string;
        calibrationProfile: string | null;
        status: string;
      }>('tanks', { method: 'POST', body }),
    delete: (id: string) => apiFetch<void>(`tanks/${id}`, { method: 'DELETE' }),
  },
  pumps: {
    list: () =>
      listAll<{ id: string; stationId: string; code: string; name: string | null; status: string }>('pumps'),
    delete: (id: string) => apiFetch<void>(`pumps/${id}`, { method: 'DELETE' }),
  },
  nozzles: {
    list: (stationId?: string) =>
      listAll<{
        id: string;
        stationId: string;
        pumpCode: string;
        nozzleCode: string;
        productId: string;
        tankId: string;
        status: string;
      }>('nozzles', stationId ? { stationId } : undefined),
    create: (body: {
      stationId: string;
      pumpId: string;
      tankId: string;
      productId: string;
      code: string;
      status?: string;
    }) =>
      apiFetch<{ id: string; stationId: string; pumpCode: string; nozzleCode: string; productId: string; tankId: string; status: string }>(
        'nozzles',
        { method: 'POST', body }
      ),
    delete: (id: string) => apiFetch<void>(`nozzles/${id}`, { method: 'DELETE' }),
  },
};
