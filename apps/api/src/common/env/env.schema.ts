import { z } from 'zod';

export const envSchema = z
  .object({
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
    GOVERNANCE_APPROVAL_DEADLINE_HOURS: z.coerce.number().int().min(1).default(48),
    SWAGGER_BASIC_USER: z.string().optional(),
    SWAGGER_BASIC_PASS: z.string().optional(),
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters — set it in your .env file'),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters — set it in your .env file'),
    JWT_ACCESS_TTL: z.coerce.number().min(60).default(900),
    JWT_REFRESH_DAYS: z.coerce.number().min(1).max(90).default(7),
    AUTH_SELF_SIGNUP_ENABLED: z.coerce.boolean().default(false),
    ALLOW_OVERLAPPING_SHIFTS: z.coerce.boolean().default(false),
    SHIFT_VARIANCE_REQUIRE_REASON_THRESHOLD: z.coerce.number().default(0),
    /** Discount above this (absolute or % of total) requires manager + reason. 0 = any discount needs reason. */
    SALES_DISCOUNT_REQUIRE_MANAGER_THRESHOLD: z.coerce.number().min(0).default(10),
    /** Max allowed difference between payment split sum and total (e.g. 0.01). */
    SALES_ROUNDING_TOLERANCE: z.coerce.number().min(0).default(0.01),
    /** When |orderedQty - receivedQty| > this, variance reason is required on GRN. */
    DELIVERY_VARIANCE_REQUIRE_REASON_THRESHOLD: z.coerce.number().min(0).default(0),
    EXPORT_STORAGE_DIR: z.string().default('storage/exports'),
    EXPORT_EXPIRES_HOURS: z.coerce.number().int().min(1).default(72),
    EXPORT_OUTBOX_POLL_INTERVAL_SECONDS: z.coerce.number().int().min(1).default(10),
    EXPORT_VERIFY_BASE_URL: z
      .string()
      .url()
      .default('https://www.itembagroup.llc/public/report/verify'),
    EXPORT_DEFAULT_RETENTION_DAYS: z.coerce.number().int().min(1).default(2555),
    EXPORT_SIGN_REGULATORY_ONLY: z.coerce.boolean().default(true),
    EXPORT_STRICT_SIGNING_REQUIRED: z.coerce.boolean().default(false),
    SIGNING_PROVIDER: z.enum(['kms', 'hsm', 'file']).default('file'),
    SIGNING_KEY_ID: z.string().optional(),
    SIGNING_CERT_PEM: z.string().optional(),
    SIGNING_KEY_ENCRYPTED: z.string().optional(),
    SIGNING_KEY_PASSPHRASE: z.string().optional(),
    SIGNING_ORG_DISPLAY: z.string().default('ITEMBA-ENERGIES (IFMS)'),
    TSA_URL: z.string().url().optional(),
    TSA_PROVIDER: z.string().default('internal-tsa'),
    TSA_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
    GEMINI_API_KEY: z
      .string()
      .min(20)
      .optional()
      .or(z.literal(''))
      .transform((v) => v || undefined),
    GROQ_API_KEY: z
      .string()
      .min(20)
      .optional()
      .or(z.literal(''))
      .transform((v) => v || undefined),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    SMTP_SECURE: z.coerce.boolean().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    SMS_PROVIDER_URL: z.string().url().optional(),
    SMS_API_KEY: z.string().optional(),
    DB_POOL_MAX: z.coerce.number().int().min(1).default(20),
    DB_POOL_IDLE_TIMEOUT: z.coerce.number().int().min(0).default(30000),
    DB_POOL_CONN_TIMEOUT: z.coerce.number().int().min(0).default(5000),
    DB_STATEMENT_TIMEOUT: z.coerce.number().int().min(0).default(30000),
    DB_SSL: z.enum(['true', 'false', 'require', 'no-verify']).default('false'),
  })
  .superRefine((env, ctx) => {
    const origins = env.FRONTEND_ORIGIN.split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    if (origins.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FRONTEND_ORIGIN'],
        message: 'At least one FRONTEND_ORIGIN is required',
      });
    }
    for (const origin of origins) {
      try {
        const parsed = new URL(origin);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['FRONTEND_ORIGIN'],
            message: `Invalid origin protocol: ${origin}`,
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['FRONTEND_ORIGIN'],
          message: `Invalid FRONTEND_ORIGIN URL: ${origin}`,
        });
      }
    }

    if (env.NODE_ENV === 'production') {
      const insecureAccess = env.JWT_ACCESS_SECRET.includes('change-me');
      const insecureRefresh = env.JWT_REFRESH_SECRET.includes('change-me');
      if (insecureAccess) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_ACCESS_SECRET'],
          message: 'JWT_ACCESS_SECRET must be a strong production secret',
        });
      }
      if (insecureRefresh) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'JWT_REFRESH_SECRET must be a strong production secret',
        });
      }
      if (env.RUN_MIGRATIONS_ON_STARTUP && !env.ALLOW_PROD_STARTUP_MIGRATIONS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RUN_MIGRATIONS_ON_STARTUP'],
          message: 'Production startup migrations require ALLOW_PROD_STARTUP_MIGRATIONS=true',
        });
      }
      if (env.DB_SSL === 'false') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DB_SSL'],
          message: 'DB_SSL must be enabled in production (set to "require" or "no-verify")',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;
