import { NotificationTriggersService } from './notification-triggers.service';
import type { NotificationService } from './notifications.service';

describe('NotificationTriggersService', () => {
  let notificationService: jest.Mocked<Pick<NotificationService, 'createNotification'>>;
  let service: NotificationTriggersService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-04T10:00:00.000Z'));
    notificationService = { createNotification: jest.fn().mockResolvedValue('n1') } as any;
    service = new NotificationTriggersService(
      notificationService as unknown as NotificationService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates approval lifecycle notifications with requester and approver targeting', async () => {
    await service.notifyApprovalRequestCreated('request-1', {
      companyId: 'company-1',
      branchId: 'branch-1',
      title: 'Void sale',
      entityType: 'sale',
      entityId: 'sale-1',
      amount: 100,
      approvers: ['manager-1', 'manager-2'],
    });
    await service.notifyApprovalApproved('request-1', {
      companyId: 'company-1',
      branchId: 'branch-1',
      title: 'Void sale',
      entityType: 'sale',
      entityId: 'sale-1',
      requesterId: 'cashier-1',
      approvedBy: 'manager-1',
    });
    await service.notifyApprovalRejected('request-1', {
      companyId: 'company-1',
      branchId: 'branch-1',
      title: 'Void sale',
      entityType: 'sale',
      entityId: 'sale-1',
      requesterId: 'cashier-1',
      rejectedBy: 'manager-1',
      rejectionReason: 'Missing receipt',
    });

    expect(notificationService.createNotification).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'approval',
        severity: 'warning',
        actionUrl: '/app/approvals/request-1',
        dedupeKey: 'approval:request:request-1',
        recipients: { userIds: ['manager-1', 'manager-2'] },
      }),
    );
    expect(notificationService.createNotification).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        title: 'Request Approved',
        severity: 'info',
        data: expect.objectContaining({ approvedBy: 'manager-1' }),
        recipients: { userIds: ['cashier-1'] },
      }),
    );
    expect(notificationService.createNotification).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        title: 'Request Rejected',
        body: expect.stringContaining('Missing receipt'),
        data: expect.objectContaining({ rejectedBy: 'manager-1' }),
        recipients: { userIds: ['cashier-1'] },
      }),
    );
  });

  it('creates inventory notifications with manager role targeting', async () => {
    await service.notifyShrinkageVariance({
      id: 'variance-1',
      companyId: 'company-1',
      branchId: 'branch-1',
      productId: 'product-1',
      productName: 'Diesel',
      variancePercentage: 6,
      thresholdValue: 5,
    });
    await service.notifySuddenLevelDrop({
      companyId: 'company-1',
      branchId: 'branch-1',
      stationId: 'station-1',
      tankId: 'tank-1',
      tankCode: 'T-01',
      dropAmount: 500,
      previousLevel: 8000,
      currentLevel: 7500,
    });
    await service.notifyLowStock({
      companyId: 'company-1',
      branchId: 'branch-1',
      stationId: 'station-1',
      tankId: 'tank-2',
      tankCode: 'T-02',
      currentLevel: 900,
      minLevel: 1000,
      productId: 'product-2',
    });

    expect(notificationService.createNotification).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'inventory',
        severity: 'critical',
        title: 'Critical Shrinkage Variance Detected',
        actionUrl: '/app/inventory/variances/variance-1',
        dedupeKey: 'shrinkage:variance:branch-1:product-1',
        recipients: { roles: ['Manager'] },
      }),
    );
    expect(notificationService.createNotification).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        severity: 'critical',
        actionUrl: '/app/inventory/tanks/tank-1',
        dedupeKey: `level:drop:tank-1:${Date.now()}`,
        data: expect.objectContaining({ dropAmount: 500 }),
      }),
    );
    expect(notificationService.createNotification).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        severity: 'warning',
        title: 'Low Stock Alert',
        actionUrl: '/app/inventory/tanks/tank-2',
        dedupeKey: 'low:stock:tank-2',
      }),
    );
  });

  it('creates invoice, payable and shift notifications with expected severity and payloads', async () => {
    await service.notifyInvoiceOverdue({
      id: 'invoice-1',
      companyId: 'company-1',
      branchId: 'branch-1',
      invoiceNumber: 'INV-1',
      customerId: 'customer-1',
      customerName: 'Acme',
      amount: 1500,
      daysOverdue: 4,
      dueDate: '2026-03-01T00:00:00.000Z',
    });
    await service.notifyPayableDue({
      id: 'payable-1',
      companyId: 'company-1',
      branchId: 'branch-1',
      invoiceNumber: 'BILL-1',
      supplierId: 'supplier-1',
      supplierName: 'Supplier Ltd',
      amount: 700,
      daysUntilDue: 1,
      dueDate: '2026-03-05T00:00:00.000Z',
    });
    await service.notifyPayableDue({
      id: 'payable-2',
      companyId: 'company-1',
      invoiceNumber: 'BILL-2',
      supplierId: 'supplier-2',
      supplierName: 'Supplier Two',
      amount: 800,
      daysUntilDue: 3,
      dueDate: '2026-03-07T00:00:00.000Z',
    });
    await service.notifyShiftVariance({
      companyId: 'company-1',
      branchId: 'branch-1',
      stationId: 'station-1',
      shiftId: 'shift-1',
      varianceId: 'variance-1',
      varianceType: 'cash_short',
      varianceAmount: 50,
      shiftDate: '2026-03-04',
    });

    expect(notificationService.createNotification).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'credit',
        severity: 'warning',
        actionUrl: '/app/credit/invoices/invoice-1',
        dedupeKey: 'overdue:invoice:invoice-1',
        data: expect.objectContaining({ amount: 1500, daysOverdue: 4 }),
      }),
    );
    expect(notificationService.createNotification).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'expense',
        severity: 'warning',
        actionUrl: '/app/payables/invoices/payable-1',
      }),
    );
    expect(notificationService.createNotification).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        type: 'expense',
        severity: 'info',
        scope: { companyId: 'company-1', branchId: undefined },
      }),
    );
    expect(notificationService.createNotification).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        type: 'shift',
        severity: 'warning',
        actionUrl: '/app/shifts/shift-1/variances',
        dedupeKey: 'shift:variance:shift-1:cash_short',
      }),
    );
  });

  it('swallows notification creation errors from trigger methods', async () => {
    notificationService.createNotification.mockRejectedValue(new Error('db down'));

    await expect(
      service.notifyLowStock({
        companyId: 'company-1',
        branchId: 'branch-1',
        stationId: 'station-1',
        tankId: 'tank-1',
        tankCode: 'T-01',
        currentLevel: 1,
        minLevel: 2,
        productId: 'product-1',
      }),
    ).resolves.toBeUndefined();
  });

  describe('error handling for every trigger', () => {
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      notificationService.createNotification.mockRejectedValue(new Error('boom'));
      errorSpy = jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
    });

    afterEach(() => errorSpy.mockRestore());

    const approvalReq = {
      companyId: 'c1', branchId: 'b1', title: 't', entityType: 'sale', entityId: 's1', approvers: ['m1'],
    };
    const decision = {
      companyId: 'c1', branchId: 'b1', title: 't', entityType: 'sale', entityId: 's1', requesterId: 'r1',
    };

    it('logs and swallows errors from notifyApprovalRequestCreated', async () => {
      await expect(service.notifyApprovalRequestCreated('r1', approvalReq)).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('approval request notification'));
    });

    it('logs and swallows errors from notifyApprovalApproved', async () => {
      await expect(service.notifyApprovalApproved('r1', decision)).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('approval approved notification'));
    });

    it('logs and swallows errors from notifyApprovalRejected', async () => {
      await expect(service.notifyApprovalRejected('r1', decision)).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('approval rejected notification'));
    });

    it('logs and swallows errors from notifyShrinkageVariance', async () => {
      await expect(
        service.notifyShrinkageVariance({ id: 'v1', companyId: 'c1', branchId: 'b1', productId: 'p1', productName: 'Diesel', variancePercentage: 6, thresholdValue: 5 }),
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('shrinkage variance notification'));
    });

    it('logs and swallows errors from notifySuddenLevelDrop', async () => {
      await expect(
        service.notifySuddenLevelDrop({ companyId: 'c1', branchId: 'b1', stationId: 's1', tankId: 't1', tankCode: 'T', dropAmount: 1, previousLevel: 2, currentLevel: 1 }),
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('sudden level drop notification'));
    });

    it('logs and swallows errors from notifyInvoiceOverdue', async () => {
      await expect(
        service.notifyInvoiceOverdue({ id: 'i1', companyId: 'c1', invoiceNumber: 'INV', customerId: 'cu1', customerName: 'X', amount: 1, daysOverdue: 1, dueDate: 'd' }),
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('overdue invoice notification'));
    });

    it('logs and swallows errors from notifyPayableDue', async () => {
      await expect(
        service.notifyPayableDue({ id: 'pd1', companyId: 'c1', invoiceNumber: 'B', supplierId: 'su1', supplierName: 'S', amount: 1, daysUntilDue: 5, dueDate: 'd' }),
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('payable due notification'));
    });

    it('logs and swallows errors from notifyShiftVariance', async () => {
      await expect(
        service.notifyShiftVariance({ companyId: 'c1', branchId: 'b1', stationId: 's1', shiftId: 'sh1', varianceId: 'v1', varianceType: 'cash_short', varianceAmount: 1, shiftDate: 'd' }),
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('shift variance notification'));
    });
  });
});
