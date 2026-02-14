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

async function listAll<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T[]> {
  const search = new URLSearchParams();
  search.set('page', '1');
  search.set('pageSize', '500');
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') search.set(k, String(v));
    });
  }
  const res = await apiFetch<ListResponse<T>>(`${path}?${search.toString()}`);
  return res.data ?? [];
}

export const apiSetup = {
  companies: {
    list: () => listAll<{ id: string; name: string; code: string; status: string }>('companies'),
  },
  stations: {
    list: () => listAll<{ id: string; companyId: string; name: string; location: string; manager: string }>('stations'),
  },
  branches: {
    list: (stationId?: string) =>
      listAll<{ id: string; stationId: string; name: string }>('branches', stationId ? { stationId } : undefined),
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
  },
  pumps: {
    list: () =>
      listAll<{ id: string; stationId: string; code: string; name: string | null; status: string }>('pumps'),
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
  },
};
