import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { BadRequestException } from '@nestjs/common';
import { ExportsController, PublicReportVerificationController } from './exports.controller';

const makeResponse = () => ({
  setHeader: jest.fn(),
  send: jest.fn(),
  json: jest.fn(),
});

describe('PublicReportVerificationController', () => {
  it('is marked public for unauthenticated report verification', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PublicReportVerificationController)).toBe(true);
  });

  it('serves HTML verification when the client prefers text/html', async () => {
    const service = {
      buildPublicVerificationPage: jest.fn().mockResolvedValue('<html>ok</html>'),
      verifyByToken: jest.fn(),
    };
    const controller = new PublicReportVerificationController(service as any);
    const res = makeResponse();

    await controller.verify(
      { token: 'facefeed' },
      { headers: { accept: 'text/html' } } as any,
      res as any,
    );

    expect(service.buildPublicVerificationPage).toHaveBeenCalledWith('facefeed');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
    expect(res.send).toHaveBeenCalledWith('<html>ok</html>');
    expect(res.json).not.toHaveBeenCalled();
  });

  it('rejects missing JSON verification token and delegates valid JSON verification', async () => {
    const service = {
      buildPublicVerificationPage: jest.fn(),
      verifyByToken: jest.fn().mockResolvedValue({ valid: true }),
    };
    const controller = new PublicReportVerificationController(service as any);

    await expect(
      controller.verify({}, { headers: { accept: 'application/json' } } as any, makeResponse() as any),
    ).rejects.toThrow(BadRequestException);

    const res = makeResponse();
    await controller.verify(
      { token: 'facefeed' },
      { headers: { accept: 'application/json' } } as any,
      res as any,
    );
    expect(res.json).toHaveBeenCalledWith({ valid: true });
  });

  it('validates public receipt tokens and streams a valid receipt PDF', async () => {
    const service = {
      verifyByToken: jest
        .fn()
        .mockResolvedValueOnce({ valid: false })
        .mockResolvedValueOnce({ valid: true }),
      getVerificationReceiptPdfByToken: jest.fn().mockResolvedValue(Buffer.from('%PDF receipt')),
    };
    const controller = new PublicReportVerificationController(service as any);

    await expect(controller.downloadVerificationReceipt({}, makeResponse() as any)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      controller.downloadVerificationReceipt({ token: 'badtoken' }, makeResponse() as any),
    ).rejects.toThrow('Invalid or expired verification token');

    const res = makeResponse();
    await controller.downloadVerificationReceipt({ token: 'facefeed12345678' }, res as any);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="verification-facefeed1234.pdf"',
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '12');
    expect(res.send).toHaveBeenCalledWith(Buffer.from('%PDF receipt'));
  });
});

describe('ExportsController', () => {
  const user = { sub: 'user-1', permissions: ['reports:read', 'reports:refresh'] } as any;
  const req = { ip: '10.0.0.1', headers: { 'user-agent': 'jest' } } as any;

  const makeController = () => {
    const service = {
      createExport: jest.fn(),
      listExports: jest.fn(),
      getExport: jest.fn(),
      getDownloadMeta: jest.fn(),
      getVerificationReceiptPdf: jest.fn(),
      setLegalHold: jest.fn(),
    };
    return {
      controller: new ExportsController(service as any),
      service,
    };
  };

  it('forwards create, list, get, and legal-hold calls with request audit metadata', async () => {
    const { controller, service } = makeController();
    service.createExport.mockResolvedValue({ id: 'export-1' });
    service.listExports.mockResolvedValue([{ id: 'export-1' }]);
    service.getExport.mockResolvedValue({ id: 'export-1' });
    service.setLegalHold.mockResolvedValue({ legalHold: true });

    await expect(
      controller.create({ exportType: 'reports.overview', format: 'csv' } as any, user, req),
    ).resolves.toEqual({ id: 'export-1' });
    await expect(controller.list({ limit: 5 } as any, user)).resolves.toEqual([{ id: 'export-1' }]);
    await expect(controller.getOne({ exportId: 'export-1' }, user)).resolves.toEqual({ id: 'export-1' });
    await expect(
      controller.setLegalHold({ exportId: 'export-1' }, { enabled: true, reason: 'audit' }, user, req),
    ).resolves.toEqual({ legalHold: true });

    expect(service.createExport).toHaveBeenCalledWith(
      expect.any(Object),
      user,
      { actorUserId: 'user-1', ip: '10.0.0.1', userAgent: 'jest' },
    );
    expect(service.setLegalHold).toHaveBeenCalledWith(user, 'export-1', true, 'audit', {
      actorUserId: 'user-1',
      ip: '10.0.0.1',
      userAgent: 'jest',
    });
  });

  it('streams verification receipts with PDF headers', async () => {
    const { controller, service } = makeController();
    const receipt = Buffer.from('%PDF receipt');
    service.getVerificationReceiptPdf.mockResolvedValue(receipt);
    const res = makeResponse();

    await controller.verificationReceipt({ exportId: 'export-1' }, user, res as any);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="export-1-verification-receipt.pdf"',
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', String(receipt.length));
    expect(res.send).toHaveBeenCalledWith(receipt);
  });
});
