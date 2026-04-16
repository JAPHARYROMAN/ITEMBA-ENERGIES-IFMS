# IFMS Notifications Data Model

## Overview

The IFMS notification system provides reliable, multi-tenant notifications with an outbox pattern for guaranteed delivery. It supports per-user delivery preferences, role-based broadcasts, and multiple delivery channels.

## Tables

### 1. `notifications`

Core notification records with multi-tenant scoping.

**Columns:**
- `id` (uuid, primary) - Unique identifier
- `company_id` (uuid, not null) - Tenant scope
- `branch_id` (uuid, nullable) - Optional branch-level scoping
- `station_id` (uuid, nullable) - Optional station-level scoping
- `type` (varchar(32), not null) - Notification type (system, shift, sales, inventory, expense, transfer, approval, security)
- `severity` (varchar(16), not null) - info | success | warning | critical
- `title` (varchar(255), not null) - Short notification title
- `body` (text, nullable) - Longer description
- `data_json` (jsonb, nullable) - Additional structured data
- `action_url` (varchar(512), nullable) - Optional action link
- `dedupe_key` (varchar(255), nullable) - Prevent duplicate notifications
- `expires_at` (timestamp, nullable) - Auto-expire old notifications
- `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at` - Audit fields

**Indexes:**
- `(company_id, branch_id, created_at desc)` - Tenant-scoped queries
- `(type, created_at desc)` - Type-based filtering
- `(company_id, station_id, branch_id)` - Multi-tenant lookups
- `(dedupe_key)` - Deduplication
- `(expires_at)` - Cleanup queries

### 2. `notification_deliveries`

Per-user delivery tracking and read status.

**Columns:**
- `id` (uuid, primary) - Unique identifier
- `notification_id` (uuid, not null, foreign key) - Reference to notification
- `user_id` (uuid, not null, foreign key) - Target user
- `status` (varchar(16), not null, default: pending) - pending | sent | failed
- `read_at` (timestamp, nullable) - When user marked as read
- `seen_at` (timestamp, nullable) - When user first viewed
- `archived_at` (timestamp, nullable) - When user archived
- `delivered_via` (varchar(16), not null) - inapp | email | sms | push
- `error_message` (text, nullable) - Delivery failure details
- `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at` - Audit fields

**Indexes:**
- `(user_id, read_at, created_at desc)` - User's notification list
- `(notification_id)` - Find all deliveries for a notification
- `(status, created_at desc)` - Retry failed deliveries
- `(user_id, read_at, archived_at)` - Unread count queries

### 3. `notification_preferences`

User delivery preferences and filtering.

**Columns:**
- `id` (uuid, primary) - Unique identifier
- `user_id` (uuid, not null, unique, foreign key) - User preferences
- `channels_json` (jsonb, not null, default: {"inapp":true,"email":false,"sms":false,"push":false}) - Channel preferences
- `severity_min` (varchar(16), not null, default: info) - Minimum severity to receive
- `quiet_hours_json` (jsonb, nullable) - Do-not-disturb windows
- `digest_mode` (varchar(16), not null, default: none) - none | daily | weekly (future)
- `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at` - Audit fields

**Indexes:**
- `(user_id)` - Fast preference lookup

### 4. `notification_outbox`

Reliable outbox for async delivery processing.

**Columns:**
- `id` (uuid, primary) - Unique identifier
- `notification_id` (uuid, not null, foreign key) - Reference to notification
- `job_type` (varchar(32), not null) - deliver_inapp | send_email | send_sms
- `run_after` (timestamp, not null, default: now) - Scheduled execution time
- `attempts` (integer, not null, default: 0) - Retry counter
- `last_error` (text, nullable) - Last failure details
- `locked_at` (timestamp, nullable) - Job lock for processing
- `locked_by` (varchar(255), nullable) - Worker identifier
- `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at` - Audit fields

**Indexes:**
- `(run_after, locked_at)` - Ready jobs query
- `(job_type, attempts)` - Retry by job type
- `(notification_id)` - Find all jobs for a notification

## Multi-Tenant Scoping

All notifications are scoped to a `company_id`. Optional `branch_id` and `station_id` provide finer-grained targeting:

- **Company-wide**: Only `company_id` set
- **Branch-wide**: `company_id` + `branch_id` set
- **Station-wide**: `company_id` + `branch_id` + `station_id` set

## Delivery Flow

1. **Create Notification**: Insert into `notifications` with appropriate scoping
2. **Generate Deliveries**: For each target user, create `notification_deliveries` records respecting their preferences
3. **Queue Outbox Jobs**: Insert `notification_outbox` jobs for each delivery channel
4. **Process Jobs**: Workers claim jobs, attempt delivery, update status
5. **Track Engagement**: Update `read_at`, `seen_at`, `archived_at` as users interact

## Deduplication

Use `dedupe_key` to prevent duplicate notifications within a time window. Common patterns:
- `expense:approval:${expenseId}` - Expense approval reminders
- `shift:overlap:${stationId}` - Shift conflict warnings
- `inventory:low:${tankId}` - Low stock alerts

## Default Preferences

New users get default preferences:
- Channels: `{"inapp": true, "email": false, "sms": false, "push": false}`
- Minimum severity: `info`
- Digest mode: `none`
- Quiet hours: `null`

## Examples

### Company-wide system announcement
```sql
INSERT INTO notifications (
  company_id, type, severity, title, body
) VALUES (
  'company-uuid',
  'system',
  'info',
  'Scheduled Maintenance',
  'System will be unavailable tonight 10PM-2AM'
);
```

### Branch-level shift reminder
```sql
INSERT INTO notifications (
  company_id, branch_id, type, severity, title, data_json
) VALUES (
  'company-uuid',
  'branch-uuid',
  'shift',
  'warning',
  'Shift Starting Soon',
  '{"shiftId": "shift-uuid", "startTime": "2026-02-14T18:00:00Z"}'
);
```

### Station inventory alert
```sql
INSERT INTO notifications (
  company_id, branch_id, station_id, type, severity, title, action_url, dedupe_key
) VALUES (
  'company-uuid',
  'branch-uuid', 
  'station-uuid',
  'inventory',
  'critical',
  'Tank 1 Below Minimum Level',
  '/app/inventory/tanks/tank-uuid',
  'inventory:low:tank-uuid'
);
```
