import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from './notifications.service';

// ── Notification detail interfaces ──────────────────────────────────

export interface ApprovalRequestDetails {
  companyId: string;
  branchId?: string;
  title: string;
  entityType: string;
  entityId: string;
  amount?: number;
  approvers: string[];
}

export interface ApprovalDecisionDetails {
  companyId: string;
  branchId?: string;
  title: string;
  entityType: string;
  entityId: string;
  requesterId: string;
  approvedBy?: string;
  rejectedBy?: string;
  rejectionReason?: string;
}

export interface ShrinkageVarianceDetails {
  id: string;
  companyId: string;
  branchId: string;
  productId: string;
  productName: string;
  variancePercentage: number;
  thresholdValue: number;
}

export interface SuddenLevelDropDetails {
  companyId: string;
  branchId: string;
  stationId: string;
  tankId: string;
  tankCode: string;
  dropAmount: number;
  previousLevel: number;
  currentLevel: number;
}

export interface LowStockDetails {
  companyId: string;
  branchId: string;
  stationId: string;
  tankId: string;
  tankCode: string;
  currentLevel: number;
  minLevel: number;
  productId: string;
}

export interface InvoiceOverdueDetails {
  id: string;
  companyId: string;
  branchId?: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  daysOverdue: number;
  dueDate: string;
}

export interface PayableDueDetails {
  id: string;
  companyId: string;
  branchId?: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  daysUntilDue: number;
  dueDate: string;
}

export interface ShiftVarianceDetails {
  companyId: string;
  branchId: string;
  stationId: string;
  shiftId: string;
  varianceId: string;
  varianceType: string;
  varianceAmount: number;
  shiftDate: string;
}

@Injectable()
export class NotificationTriggersService {
  private readonly logger = new Logger(NotificationTriggersService.name);

  constructor(private readonly notificationService: NotificationService) {}

  // Governance Approval Notifications
  async notifyApprovalRequestCreated(requestId: string, requestDetails: ApprovalRequestDetails) {
    try {
      await this.notificationService.createNotification({
        scope: {
          companyId: requestDetails.companyId,
          branchId: requestDetails.branchId,
        },
        type: 'approval',
        severity: 'warning',
        title: 'Approval Request Created',
        body: `A new approval request requires your attention: ${requestDetails.title}`,
        data: {
          requestId,
          entityType: requestDetails.entityType,
          entityId: requestDetails.entityId,
          amount: requestDetails.amount,
        },
        actionUrl: `/app/approvals/${requestId}`,
        dedupeKey: `approval:request:${requestId}`,
        recipients: {
          userIds: requestDetails.approvers,
        },
      });

      this.logger.log(`Approval request notification sent for request ${requestId}`);
    } catch (error) {
      this.logger.error(`Failed to send approval request notification: ${error.message}`);
    }
  }

  async notifyApprovalApproved(requestId: string, requestDetails: ApprovalDecisionDetails) {
    try {
      await this.notificationService.createNotification({
        scope: {
          companyId: requestDetails.companyId,
          branchId: requestDetails.branchId,
        },
        type: 'approval',
        severity: 'info',
        title: 'Request Approved',
        body: `Your approval request has been approved: ${requestDetails.title}`,
        data: {
          requestId,
          entityType: requestDetails.entityType,
          entityId: requestDetails.entityId,
          approvedBy: requestDetails.approvedBy,
        },
        actionUrl: `/app/approvals/${requestId}`,
        dedupeKey: `approval:approved:${requestId}`,
        recipients: {
          userIds: [requestDetails.requesterId],
        },
      });

      this.logger.log(`Approval approved notification sent for request ${requestId}`);
    } catch (error) {
      this.logger.error(`Failed to send approval approved notification: ${error.message}`);
    }
  }

  async notifyApprovalRejected(requestId: string, requestDetails: ApprovalDecisionDetails) {
    try {
      await this.notificationService.createNotification({
        scope: {
          companyId: requestDetails.companyId,
          branchId: requestDetails.branchId,
        },
        type: 'approval',
        severity: 'warning',
        title: 'Request Rejected',
        body: `Your approval request has been rejected: ${requestDetails.title}. Reason: ${requestDetails.rejectionReason}`,
        data: {
          requestId,
          entityType: requestDetails.entityType,
          entityId: requestDetails.entityId,
          rejectedBy: requestDetails.rejectedBy,
          rejectionReason: requestDetails.rejectionReason,
        },
        actionUrl: `/app/approvals/${requestId}`,
        dedupeKey: `approval:rejected:${requestId}`,
        recipients: {
          userIds: [requestDetails.requesterId],
        },
      });

      this.logger.log(`Approval rejected notification sent for request ${requestId}`);
    } catch (error) {
      this.logger.error(`Failed to send approval rejected notification: ${error.message}`);
    }
  }

  // Stock & Loss Notifications
  async notifyShrinkageVariance(varianceDetails: ShrinkageVarianceDetails) {
    try {
      await this.notificationService.createNotification({
        scope: {
          companyId: varianceDetails.companyId,
          branchId: varianceDetails.branchId,
        },
        type: 'inventory',
        severity: 'critical',
        title: 'Critical Shrinkage Variance Detected',
        body: `Shrinkage variance of ${varianceDetails.variancePercentage}% exceeds threshold for ${varianceDetails.productName}`,
        data: {
          varianceId: varianceDetails.id,
          productId: varianceDetails.productId,
          variancePercentage: varianceDetails.variancePercentage,
          thresholdValue: varianceDetails.thresholdValue,
        },
        actionUrl: `/app/inventory/variances/${varianceDetails.id}`,
        dedupeKey: `shrinkage:variance:${varianceDetails.branchId}:${varianceDetails.productId}`,
        recipients: {
          roles: ['Manager'],
        },
      });

      this.logger.log(`Shrinkage variance notification sent for variance ${varianceDetails.id}`);
    } catch (error) {
      this.logger.error(`Failed to send shrinkage variance notification: ${error.message}`);
    }
  }

  async notifySuddenLevelDrop(dropDetails: SuddenLevelDropDetails) {
    try {
      await this.notificationService.createNotification({
        scope: {
          companyId: dropDetails.companyId,
          branchId: dropDetails.branchId,
          stationId: dropDetails.stationId,
        },
        type: 'inventory',
        severity: 'critical',
        title: 'Sudden Tank Level Drop',
        body: `Sudden level drop detected in tank ${dropDetails.tankCode}: ${dropDetails.dropAmount}L`,
        data: {
          tankId: dropDetails.tankId,
          tankCode: dropDetails.tankCode,
          dropAmount: dropDetails.dropAmount,
          previousLevel: dropDetails.previousLevel,
          currentLevel: dropDetails.currentLevel,
        },
        actionUrl: `/app/inventory/tanks/${dropDetails.tankId}`,
        dedupeKey: `level:drop:${dropDetails.tankId}:${Date.now()}`,
        recipients: {
          roles: ['Manager'],
        },
      });

      this.logger.log(`Sudden level drop notification sent for tank ${dropDetails.tankId}`);
    } catch (error) {
      this.logger.error(`Failed to send sudden level drop notification: ${error.message}`);
    }
  }

  // Low Stock Notifications
  async notifyLowStock(stockDetails: LowStockDetails) {
    try {
      await this.notificationService.createNotification({
        scope: {
          companyId: stockDetails.companyId,
          branchId: stockDetails.branchId,
          stationId: stockDetails.stationId,
        },
        type: 'inventory',
        severity: 'warning',
        title: 'Low Stock Alert',
        body: `Tank ${stockDetails.tankCode} is below minimum level: ${stockDetails.currentLevel}L (min: ${stockDetails.minLevel}L)`,
        data: {
          tankId: stockDetails.tankId,
          tankCode: stockDetails.tankCode,
          currentLevel: stockDetails.currentLevel,
          minLevel: stockDetails.minLevel,
          productId: stockDetails.productId,
        },
        actionUrl: `/app/inventory/tanks/${stockDetails.tankId}`,
        dedupeKey: `low:stock:${stockDetails.tankId}`,
        recipients: {
          roles: ['Manager'],
        },
      });

      this.logger.log(`Low stock notification sent for tank ${stockDetails.tankId}`);
    } catch (error) {
      this.logger.error(`Failed to send low stock notification: ${error.message}`);
    }
  }

  // Credit Notifications
  async notifyInvoiceOverdue(invoiceDetails: InvoiceOverdueDetails) {
    try {
      await this.notificationService.createNotification({
        scope: {
          companyId: invoiceDetails.companyId,
          branchId: invoiceDetails.branchId,
        },
        type: 'credit',
        severity: 'warning',
        title: 'Overdue Invoice',
        body: `Invoice ${invoiceDetails.invoiceNumber} for ${invoiceDetails.customerName} is overdue by ${invoiceDetails.daysOverdue} days`,
        data: {
          invoiceId: invoiceDetails.id,
          invoiceNumber: invoiceDetails.invoiceNumber,
          customerId: invoiceDetails.customerId,
          customerName: invoiceDetails.customerName,
          amount: invoiceDetails.amount,
          daysOverdue: invoiceDetails.daysOverdue,
          dueDate: invoiceDetails.dueDate,
        },
        actionUrl: `/app/credit/invoices/${invoiceDetails.id}`,
        dedupeKey: `overdue:invoice:${invoiceDetails.id}`,
        recipients: {
          roles: ['Manager'], // Credit managers typically have Manager role
        },
      });

      this.logger.log(`Overdue invoice notification sent for invoice ${invoiceDetails.id}`);
    } catch (error) {
      this.logger.error(`Failed to send overdue invoice notification: ${error.message}`);
    }
  }

  // Payables Notifications
  async notifyPayableDue(payableDetails: PayableDueDetails) {
    try {
      await this.notificationService.createNotification({
        scope: {
          companyId: payableDetails.companyId,
          branchId: payableDetails.branchId,
        },
        type: 'expense',
        severity: payableDetails.daysUntilDue <= 1 ? 'warning' : 'info',
        title: 'Supplier Invoice Due Soon',
        body: `Supplier invoice ${payableDetails.invoiceNumber} from ${payableDetails.supplierName} is due in ${payableDetails.daysUntilDue} days`,
        data: {
          payableId: payableDetails.id,
          invoiceNumber: payableDetails.invoiceNumber,
          supplierId: payableDetails.supplierId,
          supplierName: payableDetails.supplierName,
          amount: payableDetails.amount,
          daysUntilDue: payableDetails.daysUntilDue,
          dueDate: payableDetails.dueDate,
        },
        actionUrl: `/app/payables/invoices/${payableDetails.id}`,
        dedupeKey: `payable:due:${payableDetails.id}`,
        recipients: {
          roles: ['Manager'], // Finance typically has Manager role
        },
      });

      this.logger.log(`Payable due notification sent for payable ${payableDetails.id}`);
    } catch (error) {
      this.logger.error(`Failed to send payable due notification: ${error.message}`);
    }
  }

  // Shift Notifications
  async notifyShiftVariance(shiftDetails: ShiftVarianceDetails) {
    try {
      await this.notificationService.createNotification({
        scope: {
          companyId: shiftDetails.companyId,
          branchId: shiftDetails.branchId,
          stationId: shiftDetails.stationId,
        },
        type: 'shift',
        severity: 'warning',
        title: 'Shift Variance Detected',
        body: `Shift variance detected: ${shiftDetails.varianceType} of ${shiftDetails.varianceAmount}`,
        data: {
          shiftId: shiftDetails.shiftId,
          varianceId: shiftDetails.varianceId,
          varianceType: shiftDetails.varianceType,
          varianceAmount: shiftDetails.varianceAmount,
          shiftDate: shiftDetails.shiftDate,
        },
        actionUrl: `/app/shifts/${shiftDetails.shiftId}/variances`,
        dedupeKey: `shift:variance:${shiftDetails.shiftId}:${shiftDetails.varianceType}`,
        recipients: {
          roles: ['Manager'],
        },
      });

      this.logger.log(`Shift variance notification sent for shift ${shiftDetails.shiftId}`);
    } catch (error) {
      this.logger.error(`Failed to send shift variance notification: ${error.message}`);
    }
  }
}
