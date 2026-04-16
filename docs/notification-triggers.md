# IFMS Notification Triggers Documentation

## Overview

The IFMS system implements business-driven notification triggers for critical events across the platform. These triggers respect user preferences, use deduplication keys to prevent spam, and deliver targeted notifications based on roles and responsibilities.

## Trigger Categories

### 1. Governance Approval Notifications

#### Approval Request Created
- **Trigger**: When an approval request is submitted for approval
- **Severity**: `warning`
- **Dedupe Key**: `approval:request:{requestId}`
- **Recipients**: Users with approval permissions for the request type
- **Payload**:
  ```typescript
  {
    title: "Approval Request Created",
    body: "A new approval request requires your attention: {entityType} {actionType}",
    data: {
      requestId: string,
      entityType: string,
      entityId: string,
      amount: number,
    },
    actionUrl: "/app/approvals/{requestId}"
  }
  ```

#### Request Approved
- **Trigger**: When an approval request is fully approved
- **Severity**: `info`
- **Dedupe Key**: `approval:approved:{requestId}`
- **Recipients**: Original requester
- **Payload**:
  ```typescript
  {
    title: "Request Approved",
    body: "Your approval request has been approved: {title}",
    data: {
      requestId: string,
      entityType: string,
      entityId: string,
      approvedBy: string,
    }
  }
  ```

#### Request Rejected
- **Trigger**: When an approval request is rejected
- **Severity**: `warning`
- **Dedupe Key**: `approval:rejected:{requestId}`
- **Recipients**: Original requester
- **Payload**:
  ```typescript
  {
    title: "Request Rejected",
    body: "Your approval request has been rejected: {title}. Reason: {reason}",
    data: {
      requestId: string,
      entityType: string,
      entityId: string,
      rejectedBy: string,
      rejectionReason: string,
    }
  }
  ```

### 2. Stock & Loss Notifications

#### Shrinkage Variance Exceeded
- **Trigger**: When variance exceeds threshold (100L default)
- **Severity**: `critical`
- **Dedupe Key**: `shrinkage:variance:{branchId}:{productId}`
- **Recipients**: Branch Managers
- **Payload**:
  ```typescript
  {
    title: "Critical Shrinkage Variance Detected",
    body: "Shrinkage variance of {variancePercentage}% exceeds threshold for {productName}",
    data: {
      varianceId: string,
      productId: string,
      variancePercentage: number,
      thresholdValue: number,
    },
    actionUrl: "/app/inventory/variances/{varianceId}"
  }
  ```

#### Sudden Tank Level Drop
- **Trigger**: When tank level drops suddenly (future implementation)
- **Severity**: `critical`
- **Dedupe Key**: `level:drop:{tankId}:{timestamp}`
- **Recipients**: Branch Managers
- **Payload**:
  ```typescript
  {
    title: "Sudden Tank Level Drop",
    body: "Sudden level drop detected in tank {tankCode}: {dropAmount}L",
    data: {
      tankId: string,
      tankCode: string,
      dropAmount: number,
      previousLevel: number,
      currentLevel: number,
    },
    actionUrl: "/app/inventory/tanks/{tankId}"
  }
  ```

### 3. Low Stock Notifications

#### Tank Below Minimum Level
- **Trigger**: When tank current level < minimum level
- **Severity**: `warning`
- **Dedupe Key**: `low:stock:{tankId}`
- **Recipients**: Branch Managers, Operators
- **Payload**:
  ```typescript
  {
    title: "Low Stock Alert",
    body: "Tank {tankCode} is below minimum level: {currentLevel}L (min: {minLevel}L)",
    data: {
      tankId: string,
      tankCode: string,
      currentLevel: number,
      minLevel: number,
      productId: string,
    },
    actionUrl: "/app/inventory/tanks/{tankId}"
  }
  ```

### 4. Credit Management Notifications

#### Overdue Invoice
- **Trigger**: Daily check for overdue customer invoices
- **Severity**: `warning`
- **Schedule**: 06:30 daily
- **Dedupe Key**: `overdue:invoice:{invoiceId}`
- **Recipients**: Credit Managers (Manager role)
- **Payload**:
  ```typescript
  {
    title: "Overdue Invoice",
    body: "Invoice {invoiceNumber} for {customerName} is overdue by {daysOverdue} days",
    data: {
      invoiceId: string,
      invoiceNumber: string,
      customerId: string,
      customerName: string,
      amount: number,
      daysOverdue: number,
      dueDate: string,
    },
    actionUrl: "/app/credit/invoices/{invoiceId}"
  }
  ```

### 5. Payables Notifications

#### Supplier Invoice Due Soon
- **Trigger**: Daily check for supplier invoices due within 3 days
- **Severity**: `info` (3 days), `warning` (1 day)
- **Schedule**: 06:30 daily
- **Dedupe Key**: `payable:due:{payableId}`
- **Recipients**: Finance team (Manager role)
- **Payload**:
  ```typescript
  {
    title: "Supplier Invoice Due Soon",
    body: "Supplier invoice {invoiceNumber} from {supplierName} is due in {daysUntilDue} days",
    data: {
      payableId: string,
      invoiceNumber: string,
      supplierId: string,
      supplierName: string,
      amount: number,
      daysUntilDue: number,
      dueDate: string,
    },
    actionUrl: "/app/payables/invoices/{payableId}"
  }
  ```

### 6. Shift Management Notifications

#### Shift Variance Detected
- **Trigger**: When shift is closed with variance ≠ 0
- **Severity**: `warning`
- **Dedupe Key**: `shift:variance:{shiftId}:{varianceType}`
- **Recipients**: Branch Managers
- **Payload**:
  ```typescript
  {
    title: "Shift Variance Detected",
    body: "Shift variance detected: {varianceType} of {varianceAmount}",
    data: {
      shiftId: string,
      varianceId: string,
      varianceType: "overage" | "shortage",
      varianceAmount: number,
      shiftDate: string,
    },
    actionUrl: "/app/shifts/{shiftId}/variances"
  }
  ```

## Implementation Details

### Notification Service Integration

All triggers use the `NotificationTriggersService` which internally calls `NotificationService.createNotification()`. This ensures:

1. **Single Entry Point**: All notifications go through the same validation and processing
2. **Deduplication**: 24-hour deduplication window prevents spam
3. **Preference Filtering**: Respects user `severity_min` settings
4. **Multi-tenant Scoping**: Proper company/branch/station isolation
5. **Audit Logging**: All notifications are logged for compliance

### Threshold Configuration

The `notification_thresholds` table allows configurable thresholds:

```sql
-- Example threshold configurations
INSERT INTO notification_thresholds (company_id, category, threshold_type, threshold_value) VALUES
('company-1', 'shrinkage', 'absolute', 100),      -- 100L variance threshold
('company-1', 'low_stock', 'percentage', 20),     -- 20% of capacity
('company-1', 'variance', 'absolute', 50);        -- 50L variance threshold
```

### Scheduled Jobs

The `NotificationSchedulerService` handles time-based triggers:

```typescript
@Cron('0 30 6 * * *') // Daily at 06:30 UTC
async handleDailyArApChecks() {
  await this.checkOverdueInvoices();
  await this.checkPayablesDueSoon();
}
```

## Recipient Resolution

### Role-Based Recipients
- `Manager`: Branch managers, department heads
- `Cashier`: Front desk operators
- `Auditor`: Internal audit team

### User-Specific Recipients
- Direct `userIds` for targeted notifications
- Requesters for approval workflows
- Approvers for governance notifications

### Branch Membership
- `branchMembership: true` notifies all active users in a branch
- Useful for station-wide alerts or operational notifications

## Deduplication Strategy

### Key Patterns
- **Approval**: `approval:{action}:{requestId}`
- **Inventory**: `shrinkage:variance:{branchId}:{productId}`
- **Low Stock**: `low:stock:{tankId}`
- **Financial**: `overdue:invoice:{invoiceId}`, `payable:due:{payableId}`
- **Operations**: `shift:variance:{shiftId}:{varianceType}`

### 24-Hour Window
Same dedupe key within 24 hours returns existing notification instead of creating new one.

## Error Handling

### Graceful Degradation
- Notification failures don't block business operations
- Errors are logged for monitoring
- Critical operations continue even if notifications fail

### Logging Strategy
```typescript
try {
  await this.notificationTriggers.notifyApprovalRequestCreated(...);
} catch (error) {
  console.error('Failed to send approval request notification:', error);
  // Continue with business logic
}
```

## Configuration

### Environment Variables
```bash
# Scheduler configuration
NOTIFICATION_OUTBOX_POLL_INTERVAL=30  # Seconds between outbox processing

# Timezone for scheduled jobs (can be made configurable per company)
DEFAULT_TIMEZONE=UTC
```

### Module Dependencies
The notifications module must be imported by modules that want to send notifications:

```typescript
@Module({
  imports: [NotificationsModule],
  // ...
})
export class GovernanceModule {
  // ...
}
```

## Monitoring and Maintenance

### Log Monitoring
- Watch for "Failed to send notification" errors
- Monitor outbox processing logs
- Track scheduled job execution

### Performance Considerations
- Batch notifications where possible
- Use database indexes for efficient queries
- Monitor notification delivery times

### Database Maintenance
- Clean up old notification deliveries (configurable retention)
- Archive audit logs periodically
- Monitor notification table sizes

## Testing

### Unit Tests
- Test each trigger method with mock data
- Verify deduplication logic
- Test error handling scenarios

### Integration Tests
- End-to-end notification flow
- Real-time WebSocket delivery
- Scheduled job execution

### Manual Testing
- Create approval requests and verify notifications
- Generate variances and check alerts
- Test scheduled jobs with different time zones

## Future Enhancements

### Additional Triggers
- Customer credit limit warnings
- Tank calibration reminders
- Staff shift scheduling conflicts
- Maintenance due notifications

### Advanced Features
- Notification digests (daily/weekly summaries)
- Escalation rules for unacknowledged critical alerts
- Multi-language support
- Custom notification templates

### Analytics
- Notification delivery rates
- User engagement metrics
- Response time tracking
- Alert effectiveness analysis

## Security Considerations

### Data Privacy
- Ensure sensitive data is not exposed in notifications
- Respect user privacy preferences
- Secure audit log access

### Access Control
- Validate recipient permissions
- Prevent notification spoofing
- Rate limiting for notification creation

### Compliance
- Audit trail for all notifications
- Data retention policies
- GDPR compliance for user data
