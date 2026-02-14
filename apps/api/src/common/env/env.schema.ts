import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(3001),
  FRONTEND_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  REQUEST_BODY_LIMIT: z.string().default('1mb'),
  DATABASE_URL: z
    .string()
    .url('DATABASE_URL must be a valid URL')
    .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), {
      message: 'DATABASE_URL must use postgres:// or postgresql://',
    }),
  RUN_MIGRATIONS_ON_STARTUP: z.coerce.boolean().default(false),
  ALLOW_PROD_STARTUP_MIGRATIONS: z.coerce.boolean().default(false),
  ENABLE_SWAGGER: z.coerce.boolean().default(false),
  REPORTS_EXPLAIN: z.coerce.boolean().default(false),
  REPORTS_CACHE_ENABLED: z.coerce.boolean().default(true),
  REPORTS_CACHE_MAX_ENTRIES: z.coerce.number().int().min(10).default(500),
  REPORTS_CACHE_TTL_SECONDS_DEFAULT: z.coerce.number().int().min(1).default(60),
  REPORTS_CACHE_TTL_SECONDS_OVERVIEW: z.coerce.number().int().min(1).default(60),
  REPORTS_CACHE_TTL_SECONDS_DAILY_OPERATIONS: z.coerce.number().int().min(1).default(60),
  REPORTS_CACHE_TTL_SECONDS_STOCK_LOSS: z.coerce.number().int().min(1).default(60),
  REPORTS_CACHE_TTL_SECONDS_PROFITABILITY: z.coerce.number().int().min(1).default(60),
  REPORTS_CACHE_TTL_SECONDS_CREDIT_CASHFLOW: z.coerce.number().int().min(1).default(60),
  REPORTS_CACHE_TTL_SECONDS_STATION_COMPARISON: z.coerce.number().int().min(1).default(120),
  REPORTS_SLOW_QUERY_THRESHOLD_MS: z.coerce.number().int().min(100).default(2000),
  OPS_METRICS_ENABLED: z.coerce.boolean().default(false),
  GOVERNANCE_ENABLED: z.coerce.boolean().default(false),
  SWAGGER_BASIC_USER: z.string().optional(),
  SWAGGER_BASIC_PASS: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters').default('change-me-in-production-min-32-characters-now'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters').default('change-me-refresh-in-prod-32-characters'),
  JWT_ACCESS_TTL: z.coerce.number().min(60).default(900),
  JWT_REFRESH_DAYS: z.coerce.number().min(1).max(90).default(7),
  ALLOW_OVERLAPPING_SHIFTS: z.coerce.boolean().default(false),
  SHIFT_VARIANCE_REQUIRE_REASON_THRESHOLD: z.coerce.number().default(0),
  /** Discount above this (absolute or % of total) requires manager + reason. 0 = any discount needs reason. */
  SALES_DISCOUNT_REQUIRE_MANAGER_THRESHOLD: z.coerce.number().min(0).default(10),
  /** Max allowed difference between payment split sum and total (e.g. 0.01). */
  SALES_ROUNDING_TOLERANCE: z.coerce.number().min(0).default(0.01),
  /** When |orderedQty - receivedQty| > this, variance reason is required on GRN. */
  DELIVERY_VARIANCE_REQUIRE_REASON_THRESHOLD: z.coerce.number().min(0).default(0),
}).superRefine((env, ctx) => {
  const origins = env.FRONTEND_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  if (origins.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['FRONTEND_ORIGIN'], message: 'At least one FRONTEND_ORIGIN is required' });
  }
  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['FRONTEND_ORIGIN'], message: `Invalid origin protocol: ${origin}` });
      }
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['FRONTEND_ORIGIN'], message: `Invalid FRONTEND_ORIGIN URL: ${origin}` });
    }
  }

  if (env.NODE_ENV === 'production') {
    const insecureAccess = env.JWT_ACCESS_SECRET.includes('change-me');
    const insecureRefresh = env.JWT_REFRESH_SECRET.includes('change-me');
    if (insecureAccess) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['JWT_ACCESS_SECRET'], message: 'JWT_ACCESS_SECRET must be a strong production secret' });
    }
    if (insecureRefresh) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['JWT_REFRESH_SECRET'], message: 'JWT_REFRESH_SECRET must be a strong production secret' });
    }
    if (env.RUN_MIGRATIONS_ON_STARTUP && !env.ALLOW_PROD_STARTUP_MIGRATIONS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RUN_MIGRATIONS_ON_STARTUP'],
        message: 'Production startup migrations require ALLOW_PROD_STARTUP_MIGRATIONS=true',
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;
