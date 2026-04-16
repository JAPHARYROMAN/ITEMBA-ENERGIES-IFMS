import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Inject } from '@nestjs/common';
import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import {
  creditInvoices,
  supplierInvoices,
} from '../../database/schema';
import { NotificationTriggersService } from '../notifications/notification-triggers.service';

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private readonly configService: ConfigService,
    private readonly notificationTriggers: NotificationTriggersService,
  ) {}

  /**
   * Daily job at 06:30 to check for overdue invoices and payable due dates
   */
  @Cron('0 30 6 * * *', {
    name: 'daily-ar-ap-check',
    timeZone: 'UTC', // Consider making this configurable per company
  })
  async handleDailyArApChecks() {
    this.logger.log('Starting daily AR/AP checks...');
    
    try {
      await this.checkOverdueInvoices();
      await this.checkPayablesDueSoon();
      this.logger.log('Daily AR/AP checks completed successfully');
    } catch (error) {
      this.logger.error('Error during daily AR/AP checks:', error);
    }
  }

  /**
   * Check for overdue customer invoices
   */
  private async checkOverdueInvoices() {
    const today = new Date();
    
    // Find overdue invoices (due date < today and not paid)
    const overdueInvoices = await this.db
      .select()
      .from(creditInvoices)
      .where(
        and(
          lte(creditInvoices.dueDate, today),
          sql`${creditInvoices.status} != 'paid'`,
          isNull(creditInvoices.deletedAt),
        ),
      );

    this.logger.log(`Found ${overdueInvoices.length} overdue invoices`);

    for (const invoice of overdueInvoices) {
      try {
        const daysOverdue = Math.floor(
          (today.getTime() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24)
        );

        await this.notificationTriggers.notifyInvoiceOverdue({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerId: invoice.customerId,
          customerName: 'Customer', // Will be resolved from customer table if needed
          amount: Number(invoice.totalAmount),
          dueDate: new Date(invoice.dueDate).toISOString(),
          daysOverdue,
          companyId: invoice.companyId,
          branchId: invoice.branchId,
        });
      } catch (error) {
        this.logger.error(`Failed to send overdue notification for invoice ${invoice.id}:`, error);
      }
    }
  }

  /**
   * Check for supplier invoices due within 3 days
   */
  private async checkPayablesDueSoon() {
    const today = new Date();
    const threeDaysFromNow = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
    
    // Find supplier invoices due within 3 days (and not paid)
    const payableInvoices = await this.db
      .select()
      .from(supplierInvoices)
      .where(
        and(
          gte(supplierInvoices.dueDate, today),
          lte(supplierInvoices.dueDate, threeDaysFromNow),
          sql`${supplierInvoices.status} != 'paid'`,
          isNull(supplierInvoices.deletedAt),
        ),
      );

    this.logger.log(`Found ${payableInvoices.length} payable invoices due soon`);

    for (const payable of payableInvoices) {
      try {
        const daysUntilDue = Math.ceil(
          (new Date(payable.dueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        await this.notificationTriggers.notifyPayableDue({
          id: payable.id,
          invoiceNumber: payable.invoiceNumber,
          supplierId: payable.supplierId,
          supplierName: 'Supplier', // Will be resolved from supplier table if needed
          amount: Number(payable.totalAmount),
          dueDate: new Date(payable.dueDate).toISOString(),
          daysUntilDue,
          companyId: payable.companyId,
          branchId: payable.branchId,
        });
      } catch (error) {
        this.logger.error(`Failed to send payable due notification for invoice ${payable.id}:`, error);
      }
    }
  }

  /**
   * Manual trigger for testing purposes
   */
  async triggerDailyArApChecks() {
    this.logger.log('Manual trigger for daily AR/AP checks');
    await this.handleDailyArApChecks();
  }
}
