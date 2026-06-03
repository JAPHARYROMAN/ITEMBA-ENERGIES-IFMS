import { NotificationMetricsService } from './notification-metrics.service';

describe('NotificationMetricsService', () => {
  let service: NotificationMetricsService;

  beforeEach(() => {
    service = new NotificationMetricsService();
  });

  it('aggregates counters and averages outbox lag for health checks', () => {
    service.incrementNotificationsCreated('system', 'info');
    service.incrementNotificationsCreated('system', 'warning');
    service.incrementDeliveriesSent('email');
    service.incrementDeliveriesSent('email');
    service.incrementDeliveriesFailed('sms', 'missing_phone');
    service.incrementDeliveryFailures('push');
    service.incrementRealtimePushes();
    service.incrementRateLimited();
    service.incrementDeduplicated();
    service.recordOutboxLag('job-1', 10);
    service.recordOutboxLag('job-2', 30);

    expect(service.getCurrentMetrics()).toEqual({
      notificationsCreated: 2,
      deliveriesSent: 2,
      deliveriesFailed: 2,
      realtimePushes: 1,
      rateLimited: 1,
      deduplicated: 1,
      outboxLag: 20,
    });
  });

  it('renders grouped prometheus metrics with labels and summed values', () => {
    service.incrementDeliveriesSent('email');
    service.incrementDeliveriesSent('email');
    service.incrementDeliveriesFailed('sms');
    service.recordOutboxBatch(4, 3, 1);
    service.recordOutboxProcessingTime(25);
    service.recordOutboxError();
    service.recordPermanentFailure('push');
    service.recordRetry('sms');

    const output = service.getPrometheusMetrics();

    expect(output).toContain('# HELP deliveries_sent_total deliveries sent total');
    expect(output).toContain('deliveries_sent_total{channel="email"} 2');
    expect(output).toContain('deliveries_failed_total{channel="sms",reason="unknown"} 1');
    expect(output).toContain('outbox_batch_found_total 4');
    expect(output).toContain('outbox_batch_processed_total 3');
    expect(output).toContain('outbox_batch_failed_total 1');
    expect(output).toContain('outbox_processing_duration_ms 25');
    expect(output).toContain('outbox_errors_total 1');
    expect(output).toContain('permanent_failures_total{channel="push"} 1');
    expect(output).toContain('delivery_retries_total{channel="sms"} 1');
    expect(output.endsWith('\n')).toBe(true);
  });

  it('returns zeroes when there are no metrics and can clear collected metrics', () => {
    expect(service.getCurrentMetrics()).toEqual({
      notificationsCreated: 0,
      deliveriesSent: 0,
      deliveriesFailed: 0,
      realtimePushes: 0,
      rateLimited: 0,
      deduplicated: 0,
      outboxLag: 0,
    });

    service.incrementNotificationsCreated('system', 'info');
    service.clear();

    expect(service.getCurrentMetrics().notificationsCreated).toBe(0);
    expect(service.getPrometheusMetrics()).toBe('\n');
  });

  it('trims metric history to the maximum retained entries', () => {
    for (let index = 0; index < 10005; index++) {
      service.incrementDeliveriesSent(`channel-${index}`);
    }

    const metrics = (service as any).metrics;
    expect(metrics).toHaveLength(10000);
    expect(metrics[0].labels.channel).toBe('channel-5');
  });
});
