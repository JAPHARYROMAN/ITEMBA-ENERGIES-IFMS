import { ExportsRendererService } from './exports.renderer.service';

describe('ExportsRendererService', () => {
  const createdAt = new Date('2026-02-03T04:05:06.000Z');
  const scope = {
    userId: 'user-1',
    permissions: ['reports:read'],
    companyId: 'scope-company',
    branchId: 'scope-branch',
    companyIds: ['scope-company'],
    branchIds: ['scope-branch'],
  };

  const makeService = (config: Record<string, unknown> = {}) => {
    const reports = {
      getOverview: jest.fn(),
      getDailyOperations: jest.fn(),
      getStockLoss: jest.fn(),
      getProfitability: jest.fn(),
      getCreditCashflow: jest.fn(),
      getStationComparison: jest.fn(),
    };
    const cfg = {
      get: jest.fn((key: string, fallback?: unknown) =>
        Object.prototype.hasOwnProperty.call(config, key) ? config[key] : fallback,
      ),
    };
    return {
      service: new ExportsRendererService(reports as any, cfg as any),
      reports,
      cfg,
    };
  };

  const renderArgs = (overrides: Partial<Parameters<ExportsRendererService['renderExport']>[0]> = {}) =>
    ({
      exportId: 'export-12345678',
      exportType: 'tables.any',
      format: 'csv',
      params: {},
      verificationToken: 'token-123',
      scope,
      createdAt,
      ...overrides,
    }) as Parameters<ExportsRendererService['renderExport']>[0];

  it('renders table CSV with metadata, escaped cells, and object coercion', async () => {
    const { service } = makeService();

    const result = await service.renderExport(
      renderArgs({
        params: {
          title: 'ignored by csv',
          columns: [
            { header: 'Name', accessorKey: 'name' },
            { header: 'Amount', accessorKey: 'amount' },
            { header: 'Active', accessorKey: 'active' },
            { header: 'Note', accessorKey: 'note' },
            { header: 'Nested', accessorKey: 'nested' },
            { header: 'Blank', accessorKey: 'blank' },
          ],
          rows: [
            {
              name: 'Acme, Inc',
              amount: 12,
              active: true,
              note: 'quoted "value"',
              nested: { a: 1 },
              blank: null,
            },
          ],
        },
      }),
    );

    const csv = result.buffer.toString('utf8');
    expect(result.mimeType).toBe('text/csv; charset=utf-8');
    expect(csv).toContain('# exportType=tables.any');
    expect(csv).toContain(`# generatedAt=${createdAt.toISOString()}`);
    expect(csv).toContain('Name,Amount,Active,Note,Nested,Blank');
    expect(csv).toContain('"Acme, Inc",12,true,"quoted ""value""","{""a"":1}",');
  });

  it('dispatches report exports with scoped perf context and flattens report CSV payloads', async () => {
    const { service, reports } = makeService();
    reports.getOverview.mockResolvedValue({
      totalSales: 100,
      rows: [{ station: 'Alpha', amount: 55 }],
      nested: { margin: 33 },
      empty: null,
    });

    const result = await service.renderExport(
      renderArgs({
        exportType: 'reports.overview',
        params: {
          dateFrom: '2026-02-01',
          dateTo: 42,
          companyId: 'company-from-query',
          stationId: 'station-1',
          branchId: '',
          productId: 'product-1',
        },
      }),
    );

    expect(reports.getOverview).toHaveBeenCalledWith(
      {
        dateFrom: '2026-02-01',
        companyId: 'company-from-query',
        stationId: 'station-1',
        branchId: '',
        productId: 'product-1',
      },
      expect.objectContaining({
        endpoint: '/exports/reports.overview',
        correlationId: 'exp-export-12345678',
        scope: expect.objectContaining({
          userId: 'user-1',
          companyId: 'company-from-query',
          branchId: '',
        }),
      }),
    );

    const csv = result.buffer.toString('utf8');
    expect(csv).toContain('section,key,value');
    expect(csv).toContain('summary,totalSales,100');
    expect(csv).toContain('nested,margin,33');
    expect(csv).toContain('summary,empty,');
    expect(csv).toContain('rows,0,"{""station"":""Alpha"",""amount"":55}"');
  });

  it('dispatches every report type and falls back to an empty payload for unknown exports', async () => {
    const { service, reports } = makeService();
    const cases: Array<[string, keyof typeof reports]> = [
      ['reports.daily-operations', 'getDailyOperations'],
      ['reports.profitability', 'getProfitability'],
      ['reports.credit-cashflow', 'getCreditCashflow'],
      ['reports.station-comparison', 'getStationComparison'],
    ];

    for (const [exportType, method] of cases) {
      reports[method].mockResolvedValue({ marker: exportType });
      const result = await service.renderExport(renderArgs({ exportType }));

      expect(result.mimeType).toBe('text/csv; charset=utf-8');
      expect(reports[method]).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          endpoint: `/exports/${exportType}`,
          scope: expect.objectContaining({
            companyId: 'scope-company',
            branchId: 'scope-branch',
          }),
        }),
      );
      expect(result.buffer.toString('utf8')).toContain(`summary,marker,${exportType}`);
    }

    const unknown = await service.renderExport(renderArgs({ exportType: 'reports.unknown' }));
    expect(unknown.buffer.toString('utf8')).toContain('section,key,value');
    expect(reports.getOverview).not.toHaveBeenCalled();
    expect(reports.getStockLoss).not.toHaveBeenCalled();
  });

  it('ignores non-string report query params and uses scope fallbacks', async () => {
    const { service, reports } = makeService();
    reports.getDailyOperations.mockResolvedValue({ total: 1 });

    await service.renderExport(
      renderArgs({
        exportType: 'reports.daily-operations',
        params: {
          dateFrom: 1,
          dateTo: false,
          companyId: null,
          stationId: ['station-1'],
          branchId: 42,
          productId: {},
        },
      }),
    );

    expect(reports.getDailyOperations).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        scope: expect.objectContaining({
          companyId: 'scope-company',
          branchId: 'scope-branch',
        }),
      }),
    );
  });

  it('uses table payload defaults and flattens primitive CSV payloads', async () => {
    const { service } = makeService();

    const table = await service.renderExport(
      renderArgs({
        params: {
          title: 42,
          columns: 'not columns',
          rows: 'not rows',
        },
      }),
    );
    const tableLines = table.buffer.toString('utf8').split('\n');
    expect(tableLines[3]).toBe('');
    expect(table.buffer.toString('utf8')).not.toContain('not columns');

    const primitiveCsv = (service as any).buildCsv('reports.unknown', null, createdAt);
    expect(primitiveCsv).toContain('root,value,');
  });

  it('renders a report PDF with configured verification URL and signer label', async () => {
    const { service, reports } = makeService({
      EXPORT_VERIFY_BASE_URL: 'https://verify.ifms.test/report',
      SIGNING_ORG_DISPLAY: 'IFMS Test Signer',
    });
    reports.getStockLoss.mockResolvedValue({
      rows: Array.from({ length: 90 }, (_value, index) => ({
        index,
        description: `line ${index}`,
      })),
    });

    const result = await service.renderExport(
      renderArgs({
        exportType: 'reports.stock-loss',
        format: 'pdf',
        params: { dateFrom: '2026-01-01', dateTo: '2026-01-31' },
        verificationToken: 'abcdef1234567890',
      }),
    );

    expect(result.mimeType).toBe('application/pdf');
    expect(result.buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('builds a verification receipt PDF with nullable signing details', async () => {
    const { service } = makeService({
      EXPORT_VERIFY_BASE_URL: 'https://verify.ifms.test/public/report/verify',
    });

    const receipt = await service.buildVerificationReceiptPdf({
      exportId: 'export-1',
      exportType: 'reports.overview',
      format: 'pdf',
      verificationToken: 'feedface',
      verificationLevel: 'basic',
      sha256Hash: null,
      generatedAt: createdAt,
      expiresAt: null,
      signer: null,
      certFingerprint: null,
      signedAt: null,
      timestampedAt: null,
      tsaProvider: null,
    });

    expect(receipt.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('builds a verification receipt PDF with populated signing details', async () => {
    const { service } = makeService({
      EXPORT_VERIFY_BASE_URL: 'https://verify.ifms.test/public/report/verify',
    });

    const receipt = await service.buildVerificationReceiptPdf({
      exportId: 'export-2',
      exportType: 'reports.profitability',
      format: 'csv',
      verificationToken: 'feedface',
      verificationLevel: 'signed_timestamped',
      sha256Hash: 'a'.repeat(64),
      generatedAt: createdAt,
      expiresAt: createdAt,
      signer: 'IFMS Signer',
      certFingerprint: 'fingerprint',
      signedAt: createdAt,
      timestampedAt: createdAt,
      tsaProvider: 'tsa',
    });

    expect(receipt.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('hashes buffers with a stable sha256 digest', () => {
    const { service } = makeService();
    expect(service.sha256(Buffer.from('ifms'))).toHaveLength(64);
    expect(service.sha256(Buffer.from('ifms'))).toBe(service.sha256(Buffer.from('ifms')));
  });
});
