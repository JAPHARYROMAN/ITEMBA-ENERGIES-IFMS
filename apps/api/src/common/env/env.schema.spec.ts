import { envSchema } from './env.schema';

describe('envSchema', () => {
  const baseEnv = {
    DATABASE_URL: 'postgresql://ifms:ifms@localhost:5432/ifms',
    JWT_ACCESS_SECRET: 'access-secret-at-least-thirty-two-chars',
    JWT_REFRESH_SECRET: 'refresh-secret-at-least-thirty-two-chars',
  };

  it('parses string false values as false', () => {
    const env = envSchema.parse({
      ...baseEnv,
      ENABLE_SWAGGER: 'false',
      REPORTS_CACHE_ENABLED: 'false',
      SMTP_SECURE: 'false',
    });

    expect(env.ENABLE_SWAGGER).toBe(false);
    expect(env.REPORTS_CACHE_ENABLED).toBe(false);
    expect(env.SMTP_SECURE).toBe(false);
  });

  it('applies defaults for blank boolean values', () => {
    const env = envSchema.parse({
      ...baseEnv,
      RUN_MIGRATIONS_ON_STARTUP: '',
      ALLOW_PROD_STARTUP_MIGRATIONS: '',
      ENABLE_SWAGGER: '',
      REPORTS_CACHE_ENABLED: '',
    });

    expect(env.RUN_MIGRATIONS_ON_STARTUP).toBe(false);
    expect(env.ALLOW_PROD_STARTUP_MIGRATIONS).toBe(false);
    expect(env.ENABLE_SWAGGER).toBe(false);
    expect(env.REPORTS_CACHE_ENABLED).toBe(true);
  });

  it('rejects ambiguous boolean strings', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      ENABLE_SWAGGER: 'disabled',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['ENABLE_SWAGGER'],
          }),
        ]),
      );
    }
  });

  it('requires basic auth credentials when production Swagger is enabled', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      NODE_ENV: 'production',
      DB_SSL: 'require',
      ENABLE_SWAGGER: 'true',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['ENABLE_SWAGGER'],
          }),
        ]),
      );
    }
  });

  it('allows production Swagger when basic auth credentials are configured', () => {
    const env = envSchema.parse({
      ...baseEnv,
      NODE_ENV: 'production',
      DB_SSL: 'require',
      ENABLE_SWAGGER: 'true',
      SWAGGER_BASIC_USER: 'docs-user',
      SWAGGER_BASIC_PASS: 'docs-pass',
    });

    expect(env.ENABLE_SWAGGER).toBe(true);
    expect(env.SWAGGER_BASIC_USER).toBe('docs-user');
    expect(env.SWAGGER_BASIC_PASS).toBe('docs-pass');
  });
});
