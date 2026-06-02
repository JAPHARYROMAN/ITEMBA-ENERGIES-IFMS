import { BadRequestException } from '@nestjs/common';
import { TransfersService } from './transfers.service';

describe('TransfersService', () => {
  const service = new TransfersService({} as any, { log: jest.fn() } as any);

  describe('product validation', () => {
    it('rejects transfers between tanks with different products', () => {
      expect(() =>
        (service as any).assertSameTransferProduct(
          { productId: 'product-a' },
          { productId: 'product-b' },
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects transfers when either tank has no configured product', () => {
      expect(() =>
        (service as any).assertSameTransferProduct({ productId: 'product-a' }, { productId: null }),
      ).toThrow(BadRequestException);
    });
  });
});
