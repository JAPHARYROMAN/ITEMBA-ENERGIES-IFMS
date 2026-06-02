# IFMS Notification System Operations Runbook

## Overview

The IFMS notification system provides real-time alerts and operational messaging across the platform. This runbook covers monitoring, troubleshooting, and maintenance procedures for the production notification system.

## Architecture

### Components
- **NotificationService**: Core business logic for creating and managing notifications
- **OutboxWorker**: Asynchronous job processor for reliable delivery
- **RealtimeGateway**: WebSocket server for instant client notifications
- **NotificationMetricsService**: Prometheus-compatible metrics collection
- **NotificationSchedulerService**: Cron jobs for periodic tasks

### Data Flow
1. Business events trigger `NotificationService.createNotification()`
2. Notifications stored in database with outbox jobs
3. OutboxWorker processes jobs asynchronously
4. Real-time events pushed via WebSocket
5. Metrics collected throughout the pipeline

## Monitoring

### Health Checks

#### Admin Health Endpoint
```
GET /api/notifications/admin/health
Authorization: Bearer <manager-jwt>
```

**Response:**
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "status": "healthy|warning|critical",
  "outbox": {
    "total_pending": 45,
    "oldest_job_age_seconds": 120,
    "failed_jobs": 2
  },
  "deliveries": {
    "total": 15420,
    "pending": 45,
    "sent": 15370,
    "failed": 5
  },
  "metrics": {
    "notificationsCreated": 1205,
    "deliveriesSent": 1198,
    "deliveriesFailed": 7,
    "realtimePushes": 1191,
    "rateLimited": 3,
    "deduplicated": 12,
    "outboxLag": 45.2
  }
}
```

**Status Thresholds:**
- `healthy`: pending jobs < 1000, failed jobs < 10
- `warning`: pending jobs 1000-5000, failed jobs 10-50
- `critical`: pending jobs > 5000, failed jobs > 50

#### Prometheus Metrics
```
GET /api/notifications/metrics
```

**Sample Output:**
```
# HELP notifications_created_total notifications created by type and severity
# TYPE notifications_created_total counter
notifications_created_total{type="inventory",severity="warning"} 125
notifications_created_total{type="approval",severity="info"} 89

# HELP deliveries_sent_total deliveries sent by channel
# TYPE deliveries_sent_total counter
deliveries_sent_total{channel="inapp"} 214

# HELP outbox_lag_seconds age of oldest pending job
# TYPE outbox_lag_seconds gauge
outbox_lag_seconds{job_id="job-123"} 45.2
```

### Key Metrics to Monitor

#### Business Metrics
- `notifications_created_total`: Track notification volume by type/severity
- `deliveries_sent_total`: Monitor delivery success rates
- `realtime_push_total`: WebSocket connection health
- `notifications_rate_limited_total`: Anti-spam effectiveness

#### Operational Metrics
- `deliveries_failed_total`: Delivery reliability issues
- `outbox_lag_seconds`: Processing backlog indicator
- `notifications_deduplicated_total`: Spam prevention effectiveness

### Alert Conditions

#### Critical Alerts
- Outbox backlog > 5000 pending jobs
- Delivery failure rate > 5%
- Outbox lag > 300 seconds (5 minutes)

#### Warning Alerts
- Outbox backlog > 1000 pending jobs
- Delivery failure rate > 1%
- Outbox lag > 120 seconds (2 minutes)
- Rate limiting > 10% of total notifications

## Troubleshooting

### High Outbox Backlog

**Symptoms:**
- `outbox.total_pending` > 1000
- `outbox.oldest_job_age_seconds` increasing
- Users reporting delayed notifications

**Diagnosis:**
1. Check OutboxWorker logs for errors
2. Verify database connectivity
3. Check system resource usage (CPU, memory)
4. Inspect failed job details

**Resolution:**
```bash
# Manual processing trigger
curl -X POST /api/notifications/outbox/process \
  -H "Authorization: Bearer <manager-token>"

# Check recent failures
curl /api/notifications/admin/health
```

**Prevention:**
- Scale OutboxWorker instances horizontally
- Optimize database queries
- Implement circuit breaker for external services

### Delivery Failures

**Symptoms:**
- `deliveries.failed` increasing
- `deliveries_failed_total` rising

**Diagnosis:**
```sql
-- Check recent failures
SELECT status, error_message, delivered_via, created_at
FROM notification_deliveries
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;
```

**Common Causes:**
- WebSocket connection issues (check RealtimeGateway logs)
- Database connection problems
- Invalid user preferences

**Resolution:**
- Restart RealtimeGateway service
- Clear corrupted preference data
- Check database connection pool

### Rate Limiting Issues

**Symptoms:**
- `notifications_rate_limited_total` high
- Users reporting missing notifications

**Diagnosis:**
```sql
-- Check rate limiting by user
SELECT user_id, COUNT(*) as notifications_last_hour
FROM notification_deliveries
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY user_id
HAVING COUNT(*) > 20
ORDER BY COUNT(*) DESC;
```

**Resolution:**
- Review notification frequency in business logic
- Consider adjusting rate limit thresholds
- Implement exponential backoff in triggering services

### WebSocket Connection Issues

**Symptoms:**
- `realtime_push_total` not increasing
- Users not receiving real-time notifications
- Client-side connection errors

**Diagnosis:**
```bash
# Check WebSocket server logs
tail -f /var/log/ifms/notifications.log | grep -i websocket

# Test connection manually
curl -I -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==" \
  -H "Sec-WebSocket-Version: 13" \
  ws://localhost:3001/realtime
```

**Resolution:**
- Restart RealtimeGateway service
- Check CORS configuration
- Verify JWT token validation
- Inspect network connectivity

## Maintenance Procedures

### Database Cleanup

**Remove old notification data:**
```sql
-- Archive notifications older than 90 days
UPDATE notifications
SET archived_at = NOW()
WHERE created_at < NOW() - INTERVAL '90 days'
  AND archived_at IS NULL;

-- Delete archived notifications older than 1 year
DELETE FROM notifications
WHERE archived_at < NOW() - INTERVAL '1 year';
```

**Clean failed outbox jobs:**
```sql
-- Remove jobs failed more than 3 times
DELETE FROM notification_outbox
WHERE attempts >= 3
  AND status = 'failed'
  AND updated_at < NOW() - INTERVAL '24 hours';
```

### Performance Optimization

**Database Indexes:**
```sql
-- Ensure these indexes exist
CREATE INDEX IF NOT EXISTS idx_notifications_dedupe
  ON notifications(dedupe_key, company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deliveries_user_created
  ON notification_deliveries(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outbox_status_run_after
  ON notification_outbox(status, run_after);
```

**Configuration Tuning:**
```bash
# Environment variables
NOTIFICATION_OUTBOX_POLL_INTERVAL=30  # seconds
NOTIFICATION_RATE_LIMIT_PER_HOUR=20   # per user
NOTIFICATION_METRICS_RETENTION=10000  # metrics to keep
```

### Backup and Recovery

**Database Backup:**
```bash
# Include notification tables in regular backups
pg_dump -h localhost -U ifms -d ifms_db \
  --table notifications \
  --table notification_deliveries \
  --table notification_preferences \
  --table notification_outbox \
  > notifications_backup.sql
```

**Recovery Procedure:**
1. Stop OutboxWorker services
2. Restore notification tables from backup
3. Verify data integrity
4. Restart services
5. Monitor metrics for anomalies

## Scaling

### Horizontal Scaling

**OutboxWorker:**
- Deploy multiple instances behind load balancer
- Use Redis for job queuing (future enhancement)
- Implement leader election for singleton jobs

**RealtimeGateway:**
- Scale WebSocket servers horizontally
- Use Redis adapter for cross-server messaging
- Implement sticky sessions for user connections

### Vertical Scaling

**Database:**
- Monitor query performance
- Add read replicas for metrics queries
- Optimize notification table partitioning

**Application:**
- Increase memory limits for high-throughput periods
- Monitor CPU usage during peak notification times
- Implement connection pooling for external services

## Emergency Procedures

### Complete System Outage

1. **Assess Impact:**
   - Check admin health endpoint
   - Verify database connectivity
   - Confirm external service status

2. **Containment:**
   - Stop notification creation temporarily
   - Switch to email-only delivery if available
   - Notify stakeholders of degraded service

3. **Recovery:**
   - Restart services in dependency order
   - Process outbox backlog manually
   - Verify real-time connections

4. **Post-Mortem:**
   - Analyze metrics for root cause
   - Update monitoring thresholds
   - Implement preventive measures

### Data Loss Scenarios

**Recent Notifications Lost:**
- Check database transaction logs
- Restore from point-in-time backup
- Re-trigger critical notifications manually

**Outbox Jobs Lost:**
- Recreate critical jobs from notification records
- Implement idempotent job processing
- Add job persistence guarantees

## Security Considerations

### Access Control
- Admin endpoints require `notifications:admin` permission
- JWT tokens validated for WebSocket connections
- Rate limiting prevents abuse
- Audit logging for all administrative actions

### Data Privacy
- User preferences encrypted at rest
- Notification content sanitized
- PII removed from logs
- GDPR compliance for user data

### Network Security
- WebSocket connections use WSS in production
- CORS properly configured
- Rate limiting on all endpoints
- Input validation and sanitization

## Development and Testing

### Local Development Setup
```bash
# Start notification services
npm run start:dev

# Test WebSocket connections
# Use browser dev tools or WebSocket test clients

# Monitor metrics
curl http://localhost:3001/api/notifications/metrics
```

### Testing Procedures
- Unit tests for all business logic
- Integration tests for WebSocket connections
- Load testing for high-volume scenarios
- Chaos testing for failure scenarios

## Future Enhancements

### Planned Improvements
- Redis-based job queuing for better scalability
- Email and SMS delivery channels
- Advanced notification templates
- User preference learning algorithms
- Mobile push notification support

### Monitoring Enhancements
- Distributed tracing integration
- Advanced alerting rules
- Predictive analytics for failure detection
- Real-time dashboard for operations team

This runbook should be updated regularly as the system evolves and new operational patterns emerge.
