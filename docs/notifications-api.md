# IFMS Notifications API Documentation

## Overview

The IFMS Notifications API provides comprehensive notification management with multi-tenant support, user preferences, and reliable delivery via an outbox pattern.

## Base URL
```
/api/notifications
```

## Authentication
All endpoints require JWT authentication and appropriate permissions.

## Endpoints

### User Notifications

#### GET /notifications
List notifications for the current user with pagination and filtering.

**Query Parameters:**
- `status` (optional): Filter by delivery status - `pending`, `sent`, `failed`
- `unread` (optional, boolean): Only show unread notifications
- `severity` (optional): Filter by severity - `info`, `success`, `warning`, `critical`
- `type` (optional): Filter by notification type
- `dateFrom` (optional, ISO date): Filter notifications from this date
- `dateTo` (optional, ISO date): Filter notifications until this date
- `page` (optional, default: 1): Page number for pagination
- `pageSize` (optional, default: 25, max: 100): Items per page

**Response:**
```json
{
  "data": [
    {
      "id": "delivery-uuid",
      "notificationId": "notification-uuid",
      "userId": "user-uuid",
      "status": "sent",
      "readAt": null,
      "seenAt": null,
      "archivedAt": null,
      "deliveredVia": "inapp",
      "errorMessage": null,
      "notification": {
        "id": "notification-uuid",
        "type": "system",
        "severity": "info",
        "title": "System Maintenance",
        "body": "System will be unavailable tonight",
        "data": {},
        "actionUrl": "/app/maintenance",
        "createdAt": "2026-02-14T18:00:00Z"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "total": 100,
    "totalPages": 4
  }
}
```

#### GET /notifications/unread-count
Get the count of unread notifications for the current user.

**Response:**
```json
{
  "count": 5
}
```

#### GET /notifications/preferences
Get notification preferences for the current user.

**Response:**
```json
{
  "channelsJson": {
    "inapp": true,
    "email": false,
    "sms": false,
    "push": false
  },
  "severityMin": "info",
  "quietHoursJson": null,
  "digestMode": "none"
}
```

#### PATCH /notifications/preferences
Update notification preferences for the current user.

**Request Body:**
```json
{
  "channelsJson": {
    "inapp": true,
    "email": true,
    "sms": false,
    "push": false
  },
  "severityMin": "warning",
  "quietHoursJson": {
    "enabled": true,
    "start": "22:00",
    "end": "08:00",
    "timezone": "UTC"
  },
  "digestMode": "daily"
}
```

**Response:**
```json
{
  "message": "Preferences updated successfully"
}
```

#### POST /notifications/:deliveryId/seen
Mark a notification as seen (first time user views it).

**Response:**
```json
{
  "message": "Notification marked as seen"
}
```

#### POST /notifications/:deliveryId/read
Mark a notification as read (user explicitly acknowledges).

**Response:**
```json
{
  "message": "Notification marked as read"
}
```

#### POST /notifications/:deliveryId/archive
Archive a notification (hide from main list).

**Response:**
```json
{
  "message": "Notification archived"
}
```

### Admin Notifications

#### POST /admin/notifications/create
Create a new notification (Admin only).

**Permissions Required:** `notifications:admin`

**Request Body:**
```json
{
  "companyId": "company-uuid",
  "branchId": "branch-uuid",
  "stationId": "station-uuid",
  "type": "system",
  "severity": "warning",
  "title": "Maintenance Alert",
  "body": "Scheduled maintenance will occur tonight",
  "data": {
    "maintenanceType": "database",
    "duration": "2 hours"
  },
  "actionUrl": "/app/maintenance",
  "dedupeKey": "maintenance-database-2026-02-14",
  "expiresAt": "2026-02-15T06:00:00Z",
  "recipients": {
    "userIds": ["user-uuid-1", "user-uuid-2"],
    "roles": ["Manager"],
    "branchMembership": true
  }
}
```

**Response:**
```json
{
  "notificationId": "notification-uuid",
  "message": "Notification created successfully"
}
```

#### POST /admin/notifications/test
Send a test notification (Manager only).

**Permissions Required:** `notifications:test`

**Request Body:**
```json
{
  "title": "Test Notification",
  "body": "This is a test notification",
  "severity": "info",
  "userId": "user-uuid",
  "branchId": "branch-uuid"
}
```

**Response:**
```json
{
  "notificationId": "notification-uuid",
  "message": "Test notification sent successfully"
}
```

#### POST /admin/notifications/outbox/process
Manually trigger outbox processing (Admin only).

**Permissions Required:** `notifications:admin`

**Response:**
```json
{
  "message": "Outbox processing completed",
  "processed": 15,
  "failed": 2
}
```

## Notification Types

The system supports the following notification types:

- `system` - System announcements and maintenance
- `shift` - Shift-related notifications (start, end, conflicts)
- `sales` - Sales alerts and summaries
- `inventory` - Stock level alerts and delivery notifications
- `expense` - Expense submission and approval notifications
- `transfer` - Transfer status updates
- `approval` - Approval request notifications
- `security` - Security alerts and login notifications

## Severity Levels

- `info` - General information
- `success` - Successful operations
- `warning` - Warnings that require attention
- `critical` - Critical issues requiring immediate action

## Recipient Resolution

Notifications can be sent to:

1. **Explicit User IDs** - Specific users
2. **By Role** - All users with specific roles:
   - `Manager` - Branch/station managers
   - `Cashier` - Front-line cashiers
   - `Auditor` - Audit and compliance users
3. **By Branch Membership** - All users belonging to a specific branch

Multiple recipient types can be combined.

## Deduplication

Use `dedupeKey` to prevent duplicate notifications within a 24-hour window. Common patterns:

- `expense:approval:${expenseId}` - Expense approval reminders
- `shift:overlap:${stationId}` - Shift conflict warnings
- `inventory:low:${tankId}` - Low stock alerts

If a notification with the same `dedupeKey` exists within 24 hours, the existing notification ID is returned instead of creating a duplicate.

## Multi-Tenant Scoping

Notifications are scoped using:

- `companyId` (required) - Tenant scope
- `branchId` (optional) - Branch-level targeting
- `stationId` (optional) - Station-level targeting

Users only receive notifications within their scope.

## Delivery Processing

The system uses an outbox pattern for reliable delivery:

1. Notifications and deliveries are created atomically
2. Outbox jobs are queued for each delivery channel
3. Background workers process jobs with locking and retry logic
4. Failed jobs are retried with exponential backoff (up to 10 attempts)
5. Real-time events are published for in-app deliveries

## Error Handling

- **400 Bad Request** - Invalid input, no valid recipients
- **401 Unauthorized** - Missing or invalid authentication
- **403 Forbidden** - Insufficient permissions
- **404 Not Found** - Delivery not found or access denied
- **500 Internal Server Error** - System errors

## Rate Limiting

API endpoints are rate-limited to prevent abuse:
- 10 requests per second per user (short-term)
- 100 requests per minute per user (medium-term)

## Examples

### Create a branch-wide maintenance notification
```bash
POST /api/admin/notifications/create
Authorization: Bearer <jwt-token>

{
  "companyId": "company-123",
  "branchId": "branch-456",
  "type": "system",
  "severity": "warning",
  "title": "Branch Maintenance",
  "body": "Branch systems will be down for maintenance tonight 10PM-2AM",
  "recipients": {
    "branchMembership": true
  }
}
```

### Get unread notifications
```bash
GET /api/notifications?unread=true&pageSize=10
Authorization: Bearer <jwt-token>
```

### Mark notification as read
```bash
POST /api/notifications/delivery-789/read
Authorization: Bearer <jwt-token>
```

### Update preferences to receive email notifications
```bash
PATCH /api/notifications/preferences
Authorization: Bearer <jwt-token>

{
  "channelsJson": {
    "inapp": true,
    "email": true,
    "sms": false,
    "push": false
  },
  "severityMin": "warning"
}
```
