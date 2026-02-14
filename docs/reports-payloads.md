# Reports API Payloads

All endpoints are under `/api/reports` and accept optional filters:
- `dateFrom` (ISO date)
- `dateTo` (ISO date)
- `companyId` (UUID)
- `stationId` (UUID)
- `branchId` (UUID)
- `productId` (UUID)

## GET `/reports/overview`
```json
{
  "kpis": {
    "totalSales": { "value": 0, "change": 0, "trend": "neutral" },
    "litersSold": { "value": 0, "change": 0, "trend": "neutral" },
    "grossMargin": { "value": 0, "change": 0, "trend": "neutral" },
    "shrinkage": { "value": 0, "change": 0, "trend": "neutral" },
    "receivables": { "value": 0, "change": 0, "trend": "neutral" },
    "payables": { "value": 0, "change": 0, "trend": "neutral" }
  },
  "salesTrend": [{ "date": "2026-02-01", "amount": 0 }],
  "paymentMix": [{ "name": "cash", "value": 0 }],
  "varianceByStation": [{ "station": "Station A", "variance": 0, "status": "Normal" }],
  "topDebtors": [
    {
      "id": "uuid",
      "name": "Customer",
      "balance": 0,
      "limit": 0,
      "utilization": 0,
      "status": "Healthy",
      "lastPaymentAmount": 0,
      "lastPayment": "2026-02-01",
      "invoices": [{ "id": "INV-1", "date": "2026-02-01", "amount": 0, "status": "Pending" }],
      "payments": [{ "id": "PAY-1", "date": "2026-02-01", "amount": 0 }]
    }
  ]
}
```

## GET `/reports/daily-operations`
```json
{
  "stats": {
    "avgShiftVariance": 0,
    "auditCompliancePct": 0,
    "pendingClosures": 0
  },
  "shifts": [
    {
      "id": "uuid",
      "startTime": "2026-02-01T08:00:00.000Z",
      "endTime": "2026-02-01T16:00:00.000Z",
      "status": "closed",
      "cashierName": "User",
      "expectedSales": 0,
      "actualSales": 0,
      "variance": 0,
      "efficiency": 0
    }
  ],
  "pumps": [
    {
      "id": "PMP-01",
      "nozzle": "NOZ-01",
      "product": "Diesel",
      "liters": 0,
      "revenue": 0,
      "uptime": 0,
      "status": "Healthy"
    }
  ],
  "payments": [{ "name": "cash", "value": 0 }]
}
```

## GET `/reports/stock-loss`
```json
{
  "summary": {
    "netLossLiters": 0,
    "valueLoss": 0,
    "avgShrinkagePct": 0
  },
  "shrinkageTrend": [{ "date": "2026-02-01", "rate": 0 }],
  "tankLosses": [
    {
      "tankId": "uuid",
      "station": "Station A",
      "product": "Diesel",
      "expected": 0,
      "actual": 0,
      "variance": 0,
      "variancePct": 0
    }
  ],
  "deliveryReconciliation": [
    {
      "id": "uuid",
      "date": "2026-02-01",
      "ordered": 0,
      "billOfLading": 0,
      "received": 0,
      "variance": 0
    }
  ]
}
```

## GET `/reports/profitability`
```json
{
  "metrics": {
    "grossProfit": { "value": 0, "change": 0, "trend": "neutral" },
    "netProfit": { "value": 0, "change": 0, "trend": "neutral" },
    "marginPerLiter": { "value": 0, "change": 0, "trend": "neutral" },
    "opexRatio": { "value": 0, "change": 0, "trend": "neutral" }
  },
  "marginByProduct": [
    { "name": "Diesel", "revenue": 0, "margin": 0, "marginPerLiter": 0 }
  ],
  "stationContribution": [
    {
      "id": "uuid",
      "name": "Station A",
      "location": "City",
      "sales": 0,
      "liters": 0,
      "grossMargin": 0,
      "allocatedOpEx": 0,
      "contribution": 0,
      "marginPct": 0,
      "shrinkagePct": 0,
      "varianceCount": 0,
      "overdueAR": 0,
      "expenseRatio": 0
    }
  ],
  "priceImpact": {
    "before": { "revenue": 0, "margin": 0 },
    "after": { "revenue": 0, "margin": 0 },
    "delta": { "revenue": 0, "margin": 0 }
  }
}
```

## GET `/reports/credit-cashflow`
```json
{
  "liquidity": {
    "current": 0,
    "totalReceivables": 0,
    "totalPayables": 0,
    "collectionEfficiencyPct": 0
  },
  "arAging": [{ "bucket": "0-30 Days", "amount": 0, "percentage": 0, "color": "#3b82f6" }],
  "apAging": [{ "bucket": "Due Now", "amount": 0, "color": "#ef4444" }],
  "simulation": {
    "opening": 0,
    "collections": 0,
    "payables": 0,
    "expenses": 0,
    "projected": 0,
    "efficiency": 0
  },
  "topDebtors": []
}
```

## GET `/reports/station-comparison`
```json
[
  {
    "id": "uuid",
    "name": "Station A",
    "location": "City",
    "sales": 0,
    "liters": 0,
    "grossMargin": 0,
    "allocatedOpEx": 0,
    "contribution": 0,
    "marginPct": 0,
    "shrinkagePct": 0,
    "varianceCount": 0,
    "overdueAR": 0,
    "expenseRatio": 0,
    "rank": 1,
    "percentile": 100,
    "trend": [{ "value": 0 }]
  }
]
```

## Caching
- Responses include `Cache-Control: private, max-age=30`.
- Server-side in-memory cache is enabled in non-production for report payloads (TTL 60 seconds).
