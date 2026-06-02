import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from '@jest/globals';

import { aggregatePaymentAllocations } from './payments.service';

describe('aggregatePaymentAllocations', () => {
  it('aggregates duplicate invoice allocations before balance validation', () => {
    expect(
      aggregatePaymentAllocations(
        [
          { invoiceId: 'inv-1', amount: 40 },
          { invoiceId: 'inv-1', amount: 10 },
          { invoiceId: 'inv-2', amount: 25.25 },
        ],
        75.25,
      ),
    ).toEqual([
      { invoiceId: 'inv-1', amount: 50 },
      { invoiceId: 'inv-2', amount: 25.25 },
    ]);
  });

  it('rejects allocations that do not sum to the payment amount', () => {
    expect(() => aggregatePaymentAllocations([{ invoiceId: 'inv-1', amount: 10 }], 11)).toThrow(
      BadRequestException,
    );
  });
});
