import { Injectable } from '@nestjs/common';

interface MetricPoint {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp?: number;
}

@Injectable()
export class NotificationMetricsService {
  private metrics: MetricPoint[] = [];
  private readonly maxMetricsHistory = 10000; // Keep last 10k metrics

  // Counters for notifications created
  incrementNotificationsCreated(type: string, severity: string): void {
    this.addMetric('notifications_created_total', 1, { type, severity });
  }

  // Counters for deliveries
  incrementDeliveriesSent(channel: string): void {
    this.addMetric('deliveries_sent_total', 1, { channel });
  }

  incrementDeliveriesFailed(channel: string, reason?: string): void {
    this.addMetric('deliveries_failed_total', 1, {
      channel,
      reason: reason || 'unknown'
    });
  }

  // Additional failure tracking method
  incrementDeliveryFailures(channel: string): void {
    this.incrementDeliveriesFailed(channel);
  }

  // Counter for realtime pushes
  incrementRealtimePushes(): void {
    this.addMetric('realtime_push_total', 1);
  }

  // Gauge for outbox lag
  recordOutboxLag(jobId: string, lagSeconds: number): void {
    this.addMetric('outbox_lag_seconds', lagSeconds, { job_id: jobId });
  }

  // Counter for rate limiting
  incrementRateLimited(): void {
    this.addMetric('notifications_rate_limited_total', 1);
  }

  // Counter for deduplication
  incrementDeduplicated(): void {
    this.addMetric('notifications_deduplicated_total', 1);
  }

  // Outbox batch processing metrics
  recordOutboxBatch(found: number, processed: number, failed: number): void {
    this.addMetric('outbox_batch_found_total', found);
    this.addMetric('outbox_batch_processed_total', processed);
    this.addMetric('outbox_batch_failed_total', failed);
  }

  // Outbox processing time
  recordOutboxProcessingTime(timeMs: number): void {
    this.addMetric('outbox_processing_duration_ms', timeMs);
  }

  // Outbox errors
  recordOutboxError(): void {
    this.addMetric('outbox_errors_total', 1);
  }

  // Permanent failures
  recordPermanentFailure(channel: string): void {
    this.addMetric('permanent_failures_total', 1, { channel });
  }

  // Retry tracking
  recordRetry(channel: string): void {
    this.addMetric('delivery_retries_total', 1, { channel });
  }

  private addMetric(name: string, value: number, labels: Record<string, string> = {}): void {
    const metric: MetricPoint = {
      name,
      value,
      labels,
      timestamp: Date.now(),
    };

    this.metrics.push(metric);

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }
  }

  // Generate Prometheus format output
  getPrometheusMetrics(): string {
    const output: string[] = [];
    const groupedMetrics = new Map<string, MetricPoint[]>();

    // Group metrics by name and labels
    for (const metric of this.metrics) {
      const key = `${metric.name}${JSON.stringify(metric.labels)}`;
      if (!groupedMetrics.has(key)) {
        groupedMetrics.set(key, []);
      }
      groupedMetrics.get(key)!.push(metric);
    }

    // Generate Prometheus format for each unique metric
    for (const [key, metrics] of groupedMetrics) {
      if (metrics.length === 0) continue;

      const latestMetric = metrics[metrics.length - 1];
      const labelsStr = Object.entries(latestMetric.labels || {})
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');

      // For counters, sum all values
      const totalValue = metrics.reduce((sum, m) => sum + m.value, 0);

      if (labelsStr) {
        output.push(`# HELP ${latestMetric.name} ${latestMetric.name.replace(/_/g, ' ')}`);
        output.push(`# TYPE ${latestMetric.name} counter`);
        output.push(`${latestMetric.name}{${labelsStr}} ${totalValue}`);
      } else {
        output.push(`# HELP ${latestMetric.name} ${latestMetric.name.replace(/_/g, ' ')}`);
        output.push(`# TYPE ${latestMetric.name} counter`);
        output.push(`${latestMetric.name} ${totalValue}`);
      }
    }

    return output.join('\n') + '\n';
  }

  // Get current metrics for health checks
  getCurrentMetrics(): {
    notificationsCreated: number;
    deliveriesSent: number;
    deliveriesFailed: number;
    realtimePushes: number;
    rateLimited: number;
    deduplicated: number;
    outboxLag: number;
  } {
    const metrics = this.metrics;

    return {
      notificationsCreated: this.sumMetrics(metrics, 'notifications_created_total'),
      deliveriesSent: this.sumMetrics(metrics, 'deliveries_sent_total'),
      deliveriesFailed: this.sumMetrics(metrics, 'deliveries_failed_total'),
      realtimePushes: this.sumMetrics(metrics, 'realtime_push_total'),
      rateLimited: this.sumMetrics(metrics, 'notifications_rate_limited_total'),
      deduplicated: this.sumMetrics(metrics, 'notifications_deduplicated_total'),
      outboxLag: this.averageMetrics(metrics, 'outbox_lag_seconds'),
    };
  }

  private sumMetrics(metrics: MetricPoint[], name: string): number {
    return metrics
      .filter(m => m.name === name)
      .reduce((sum, m) => sum + m.value, 0);
  }

  private averageMetrics(metrics: MetricPoint[], name: string): number {
    const relevantMetrics = metrics.filter(m => m.name === name);
    if (relevantMetrics.length === 0) return 0;

    const sum = relevantMetrics.reduce((acc, m) => acc + m.value, 0);
    return sum / relevantMetrics.length;
  }

  // Clear old metrics (useful for testing)
  clear(): void {
    this.metrics = [];
  }
}
