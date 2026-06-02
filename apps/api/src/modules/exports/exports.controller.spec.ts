import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { PublicReportVerificationController } from './exports.controller';

describe('PublicReportVerificationController', () => {
  it('is marked public for unauthenticated report verification', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PublicReportVerificationController)).toBe(true);
  });
});
