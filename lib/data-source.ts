import { apiSetup } from './api/setup';
import type { Company, Station, Branch, Product, Tank, Nozzle } from './models';

function mapApiTank(r: {
  id: string;
  companyId: string;
  branchId: string;
  productId: string | null;
  code: string;
  capacity: number | string;
  minLevel: number | string;
  maxLevel: number | string;
  currentLevel: number | string;
  calibrationProfile: string | null;
  status: string;
  stationId?: string;
}): Tank {
  return {
    id: r.id,
    companyId: r.companyId,
    stationId: r.stationId ?? '',
    branchId: r.branchId,
    code: r.code,
    productId: r.productId ?? '',
    capacity: Number(r.capacity),
    minLevel: Number(r.minLevel),
    maxLevel: Number(r.maxLevel),
    calibrationProfile: r.calibrationProfile ?? '',
    currentLevel: Number(r.currentLevel),
  };
}

function mapApiProduct(r: {
  id: string;
  companyId: string;
  code: string;
  name: string;
  category: string;
  pricePerUnit: string | number;
  unit: string;
  status: string;
}): Product {
  return {
    id: r.id,
    name: r.name,
    pricePerUnit: Number(r.pricePerUnit),
    category: r.category as Product['category'],
  };
}

export const setupDataSource = {
  companies: {
    list: (): Promise<Company[]> => apiSetup.companies.list() as Promise<Company[]>,
  },
  stations: {
    list: (): Promise<Station[]> => apiSetup.stations.list() as Promise<Station[]>,
  },
  branches: {
    list: (stationId?: string): Promise<Branch[]> =>
      apiSetup.branches.list(stationId) as Promise<Branch[]>,
  },
  products: {
    list: (): Promise<Product[]> => apiSetup.products.list().then((rows) => rows.map(mapApiProduct)),
    create: async (data: {
      companyId: string;
      code: string;
      name: string;
      category: string;
      pricePerUnit: number;
      unit?: string;
      status?: string;
    }) => {
      const r = await apiSetup.products.create(data);
      return mapApiProduct(r);
    },
  },
  tanks: {
    list: (stationId?: string): Promise<Tank[]> =>
      apiSetup.tanks.list(stationId).then((rows) => rows.map((row) => mapApiTank(row))),
    create: async (data: any) => {
      const r = await apiSetup.tanks.create({
        companyId: data.companyId,
        branchId: data.branchId,
        productId: data.productId || undefined,
        code: data.code,
        capacity: data.capacity,
        minLevel: data.minLevel,
        maxLevel: data.maxLevel,
        calibrationProfile: data.calibrationProfile,
        status: 'active',
      });
      return mapApiTank({ ...r, stationId: data.stationId });
    },
  },
  pumps: {
    list: (stationId?: string): Promise<{ id: string; stationId: string; code: string; name: string | null; status: string }[]> =>
      apiSetup.pumps.list().then((rows) => (stationId ? rows.filter((p) => p.stationId === stationId) : rows)),
  },
  nozzles: {
    list: (stationId?: string): Promise<Nozzle[]> =>
      apiSetup.nozzles.list(stationId).then((rows) => rows.map((r) => ({
        id: r.id,
        stationId: r.stationId,
        pumpCode: r.pumpCode,
        nozzleCode: r.nozzleCode,
        productId: r.productId,
        tankId: r.tankId,
        status: (r.status.toLowerCase() === 'inactive' ? 'Inactive' : 'Active') as Nozzle['status'],
      }))),
    create: async (data: {
      stationId: string;
      pumpId?: string;
      pumpCode?: string;
      nozzleCode: string;
      productId: string;
      tankId: string;
      status?: string;
    }) => {
      if (!data.pumpId) throw new Error('Pump is required');
      const r = await apiSetup.nozzles.create({
        stationId: data.stationId,
        pumpId: data.pumpId,
        tankId: data.tankId,
        productId: data.productId,
        code: data.nozzleCode,
        status: data.status === 'Inactive' ? 'inactive' : data.status === 'Active' ? 'active' : undefined,
      });
      return {
        id: r.id,
        stationId: r.stationId,
        pumpCode: r.pumpCode,
        nozzleCode: r.nozzleCode,
        productId: r.productId,
        tankId: r.tankId,
        status: (r.status.toLowerCase() === 'inactive' ? 'Inactive' : 'Active') as Nozzle['status'],
      };
    },
  },
};
