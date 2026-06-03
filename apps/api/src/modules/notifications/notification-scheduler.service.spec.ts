import { ConfigService } from '@nestjs/config';
import { NotificationSchedulerService } from './notification-scheduler.service';
import type { NotificationTriggersService } from './notification-triggers.service';

const selectWhere = (rows: any[]) => ({
  from: jest.fn().mockReturnValue({
    where: jest.fn().mockResolvedValue(rows),
  }),
});

describe('NotificationSchedulerService', () => {
  let db: { select: jest.Mock };
  let triggers: jest.Mocked<
    Pick<NotificationTriggersService, 'notifyInvoiceOverdue' | 'notifyPayableDue'>
  >;
  let service: NotificationSchedulerService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-04T06:30:00.000Z'));
    db = { select: jest.fn() };
    triggers = {
      notifyInvoiceOverdue: jest.fn().mockResolvedValue(undefined),
      notifyPayableDue: jest.fn().mockResolvedValue(undefined),
    } as any;
    service = new NotificationSchedulerService(
      db as any,
      {} as ConfigService,
      triggers as unknown as NotificationTriggersService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('checks overdue receivables and payable invoices due soon', async () => {
    db.select
      .mockReturnValueOnce(
        selectWhere([
          {
            id: 'invoice-1',
            invoiceNumber: 'INV-1',
            customerId: 'customer-1',
            totalAmount: '1200.50',
            dueDate: new Date('2026-03-01T06:30:00.000Z'),
            companyId: 'company-1',
            branchId: 'branch-1',
          },
        ]),
      )
      .mockReturnValueOnce(
        selectWhere([
          {
            id: 'payable-1',
            invoiceNumber: 'BILL-1',
            supplierId: 'supplier-1',
            totalAmount: '900.25',
            dueDate: new Date('2026-03-06T06:30:00.000Z'),
            companyId: 'company-1',
            branchId: 'branch-2',
          },
        ]),
      );

    await service.handleDailyArApChecks();

    expect(triggers.notifyInvoiceOverdue).toHaveBeenCalledWith({
      id: 'invoice-1',
      invoiceNumber: 'INV-1',
      customerId: 'customer-1',
      customerName: 'Customer',
      amount: 1200.5,
      dueDate: '2026-03-01T06:30:00.000Z',
      daysOverdue: 3,
      companyId: 'company-1',
      branchId: 'branch-1',
    });
    expect(triggers.notifyPayableDue).toHaveBeenCalledWith({
      id: 'payable-1',
      invoiceNumber: 'BILL-1',
      supplierId: 'supplier-1',
      supplierName: 'Supplier',
      amount: 900.25,
      dueDate: '2026-03-06T06:30:00.000Z',
      daysUntilDue: 2,
      companyId: 'company-1',
      branchId: 'branch-2',
    });
  });

  it('continues processing rows when individual notification trigger calls fail', async () => {
    triggers.notifyInvoiceOverdue.mockRejectedValueOnce(new Error('notify failed'));
    triggers.notifyPayableDue.mockRejectedValueOnce(new Error('payable failed'));
    db.select
      .mockReturnValueOnce(
        selectWhere([
          {
            id: 'invoice-1',
            invoiceNumber: 'INV-1',
            customerId: 'customer-1',
            totalAmount: '10',
            dueDate: new Date('2026-03-03T06:30:00.000Z'),
            companyId: 'company-1',
            branchId: undefined,
          },
        ]),
      )
      .mockReturnValueOnce(
        selectWhere([
          {
            id: 'payable-1',
            invoiceNumber: 'BILL-1',
            supplierId: 'supplier-1',
            totalAmount: '20',
            dueDate: new Date('2026-03-04T18:30:00.000Z'),
            companyId: 'company-1',
            branchId: undefined,
          },
        ]),
      );

    await expect(service.handleDailyArApChecks()).resolves.toBeUndefined();

    expect(triggers.notifyInvoiceOverdue).toHaveBeenCalledTimes(1);
    expect(triggers.notifyPayableDue).toHaveBeenCalledTimes(1);
  });

  it('swallows top-level database errors and supports the manual trigger wrapper', async () => {
    db.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockRejectedValue(new Error('db down')),
      }),
    });

    await expect(service.triggerDailyArApChecks()).resolves.toBeUndefined();

    expect(db.select).toHaveBeenCalledTimes(1);
  });
});
