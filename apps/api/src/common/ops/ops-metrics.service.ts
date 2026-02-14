import { Injectable } from '@nestjs/common';

const LATENCY_BUCKETS_MS = [100, 300, 1000, 3000, 10000];

@Injectable()
export class OpsMetricsService {
  private requestCount = 0;
  private readonly latencyBuckets = new Map<string, number>();
  private reportCacheHits = 0;
  private reportCacheMisses = 0;

  recordRequest(durationMs: number): void {
    this.requestCount += 1;
    const bucket = LATENCY_BUCKETS_MS.find((b) => durationMs <= b);
    const key = bucket ? `le_${bucket}ms` : 'gt_10000ms';
    this.latencyBuckets.set(key, (this.latencyBuckets.get(key) ?? 0) + 1);
  }

  recordReportCacheHit(): void {
    this.reportCacheHits += 1;
  }

  recordReportCacheMiss(): void {
    this.reportCacheMisses += 1;
  }

  snapshot() {
    const totalCache = this.reportCacheHits + this.reportCacheMisses;
    const hitRate = totalCache > 0 ? this.reportCacheHits / totalCache : 0;

    return {
      timestamp: new Date().toISOString(),
      requests: {
        total: this.requestCount,
        latencyBuckets: Object.fromEntries(this.latencyBuckets.entries()),
      },
      reportsCache: {
        hits: this.reportCacheHits,
        misses: this.reportCacheMisses,
        hitRate: Number(hitRate.toFixed(4)),
      },
    };
  }
}
