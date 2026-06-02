import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from '@jest/globals';

import { aggregateSupplierPaymentAllocations } from './supplier-payments.service';

describe('aggregateSupplierPaymentAllocations', () => {
  it('aggregates duplicate supplier invoice allocations', () => {
    expect(
      aggregateSupplierPaymentAllocations(
        [
          { invoiceId: 'sinv-1', amount: 15.25 },
          { invoiceId: 'sinv-2', amount: 25 },
          { invoiceId: 'sinv-1', amount: 4.75 },
        ],
        45,
      ),
    ).toEqual([
      { invoiceId: 'sinv-1', amount: 20 },
      { invoiceId: 'sinv-2', amount: 25 },
    ]);
  });

  it('rejects non-positive allocation amounts', () => {
    expect(() => aggregateSupplierPaymentAllocations([{ invoiceId: 'sinv-1', amount: 0 }], 10)).toThrow(
      BadRequestException,
    );
  });
});
