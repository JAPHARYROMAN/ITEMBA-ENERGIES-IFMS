import { describe, test, expect } from 'vitest';
import {
  CompanySchema,
  ProductSchema,
  TankSchema,
  NozzleSchema,
  CustomerSchema,
  ExpenseSchema,
  InvoiceSchema,
  CustomerPaymentSchema,
  DeliverySchema,
  ShiftSchema,
} from './models';

describe('models — Zod schema validation', () => {
  describe('CompanySchema', () => {
    test('accepts a valid company with an enum status', () => {
      const parsed = CompanySchema.parse({ id: 'c1', name: 'Acme', code: 'AC', status: 'active' });
      expect(parsed.status).toBe('active');
    });

    test('rejects an out-of-enum status', () => {
      expect(() =>
        CompanySchema.parse({ id: 'c1', name: 'Acme', code: 'AC', status: 'archived' }),
      ).toThrow();
    });
  });

  describe('ProductSchema', () => {
    test('requires pricePerUnit to be a number (does not coerce strings)', () => {
      expect(() =>
        ProductSchema.parse({ id: 'p1', name: 'Diesel', pricePerUnit: '100', category: 'Fuel' }),
      ).toThrow();
    });

    test('constrains category to the known enum', () => {
      const parsed = ProductSchema.parse({ id: 'p1', name: 'Oil', pricePerUnit: 5, category: 'Lubricant' });
      expect(parsed.category).toBe('Lubricant');
      expect(() =>
        ProductSchema.parse({ id: 'p1', name: 'Oil', pricePerUnit: 5, category: 'Snacks' }),
      ).toThrow();
    });
  });

  describe('TankSchema', () => {
    const base = {
      id: 't1',
      companyId: 'c1',
      stationId: 's1',
      branchId: 'b1',
      code: 'T-01',
      productId: 'p1',
      capacity: 10000,
      minLevel: 1000,
      maxLevel: 9000,
      calibrationProfile: 'linear',
      currentLevel: 5000,
    };

    test('accepts a fully-specified tank and leaves notes optional', () => {
      const parsed = TankSchema.parse(base);
      expect(parsed.notes).toBeUndefined();
      expect(parsed.currentLevel).toBe(5000);
    });

    test('rejects when a required numeric field is missing', () => {
      const { capacity: _omit, ...withoutCapacity } = base;
      expect(() => TankSchema.parse(withoutCapacity)).toThrow();
    });
  });

  describe('NozzleSchema', () => {
    test('only allows Active/Inactive status', () => {
      const ok = NozzleSchema.parse({
        id: 'n1',
        stationId: 's1',
        pumpCode: 'P1',
        nozzleCode: 'N1',
        productId: 'p1',
        tankId: 't1',
        status: 'Active',
      });
      expect(ok.status).toBe('Active');
      expect(() =>
        NozzleSchema.parse({
          id: 'n1',
          stationId: 's1',
          pumpCode: 'P1',
          nozzleCode: 'N1',
          productId: 'p1',
          tankId: 't1',
          status: 'active',
        }),
      ).toThrow();
    });
  });

  describe('CustomerSchema', () => {
    test('validates email format on the optional email field', () => {
      expect(() =>
        CustomerSchema.parse({
          id: 'cu1',
          name: 'Jane',
          email: 'not-an-email',
          creditLimit: 0,
          paymentTerms: 'net30',
          status: 'Active',
          balance: 0,
        }),
      ).toThrow();
    });

    test('omits optional contact fields without error', () => {
      const parsed = CustomerSchema.parse({
        id: 'cu1',
        name: 'Jane',
        creditLimit: 1000,
        paymentTerms: 'net30',
        status: 'Suspended',
        balance: -50,
      });
      expect(parsed.phone).toBeUndefined();
      expect(parsed.status).toBe('Suspended');
    });
  });

  describe('ExpenseSchema', () => {
    test('enforces the paymentMethod enum', () => {
      const valid = {
        id: 'e1',
        timestamp: '2026-01-01T00:00:00.000Z',
        branchId: 'b1',
        category: 'Fuel',
        amount: 100,
        vendor: 'Shell',
        paymentMethod: 'Petty Cash',
        description: '',
        status: 'Draft',
      };
      expect(ExpenseSchema.parse(valid).paymentMethod).toBe('Petty Cash');
      expect(() => ExpenseSchema.parse({ ...valid, paymentMethod: 'Crypto' })).toThrow();
    });
  });

  describe('InvoiceSchema', () => {
    test('parses an invoice with a typed item array', () => {
      const parsed = InvoiceSchema.parse({
        id: 'i1',
        invoiceNumber: 'INV-1',
        customerId: 'cu1',
        customerName: 'Jane',
        date: '2026-01-01',
        dueDate: '2026-02-01',
        status: 'Unpaid',
        totalAmount: 200,
        balanceRemaining: 200,
        items: [
          { productId: 'p1', productName: 'Diesel', quantity: 2, unitPrice: 100, tax: 0, total: 200 },
        ],
      });
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0].total).toBe(200);
    });
  });

  describe('CustomerPaymentSchema', () => {
    test('constrains method to the payment enum', () => {
      expect(() =>
        CustomerPaymentSchema.parse({
          id: 'pay1',
          customerId: 'cu1',
          amount: 50,
          method: 'cash',
          date: '2026-01-01',
          allocations: [],
        }),
      ).toThrow();
    });
  });

  describe('DeliverySchema', () => {
    test('keeps GRN-related fields optional', () => {
      const parsed = DeliverySchema.parse({
        id: 'd1',
        supplierId: 's1',
        deliveryNote: 'DN-1',
        vehicleNo: 'KAA',
        driverName: 'Bob',
        productId: 'p1',
        orderedQty: 1000,
        expectedDate: '2026-01-01',
        status: 'Pending',
        timestamp: '2026-01-01T00:00:00.000Z',
      });
      expect(parsed.receivedQty).toBeUndefined();
      expect(parsed.status).toBe('Pending');
    });
  });

  describe('ShiftSchema', () => {
    test('accepts open status and an arbitrary readings array', () => {
      const parsed = ShiftSchema.parse({
        id: 'sh1',
        stationId: 's1',
        startTime: '2026-01-01T00:00:00.000Z',
        status: 'open',
        cashierId: 'u1',
        readings: [{ anything: true }],
      });
      expect(parsed.endTime).toBeUndefined();
      expect(parsed.status).toBe('open');
    });
  });
});
