import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded, type Request, type Response, type NextFunction } from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AppLogger } from './common/logger/logger.service';
import { PG_POOL } from './database/database.module';
import { runMigrationsOnStartup } from './database/migrate';
import type { Pool } from 'pg';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.use(helmet({ contentSecurityPolicy: process.env.NODE_ENV === 'production' }));
  app.useLogger(app.get(AppLogger));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3001);
  const frontendOrigin = configService.get<string>('FRONTEND_ORIGIN', 'http://localhost:3000');
  const allowedOrigins = frontendOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const requestBodyLimit = configService.get<string>('REQUEST_BODY_LIMIT', '1mb');
  const runMigrations = configService.get<boolean>('RUN_MIGRATIONS_ON_STARTUP', false);
  const allowProdStartupMigrations = configService.get<boolean>('ALLOW_PROD_STARTUP_MIGRATIONS', false);
  const enableSwagger = configService.get<boolean>('ENABLE_SWAGGER', false);
  const swaggerUser = configService.get<string>('SWAGGER_BASIC_USER');
  const swaggerPass = configService.get<string>('SWAGGER_BASIC_PASS');

  // Safe startup check: fail fast if DB is unreachable.
  if (process.env.NODE_ENV !== 'test') {
    const pool = app.get<Pool>(PG_POOL);
    try {
      await pool.query('select 1');
      app.get(AppLogger).log('Database connectivity check passed', 'Bootstrap');
    } catch (err) {
      app.get(AppLogger).error(
        `Database connectivity check failed: ${(err as Error).message}`,
        undefined,
        'Bootstrap',
      );
      throw err;
    }
  }

  app.use(json({ limit: requestBodyLimit }));
  app.use(urlencoded({ extended: true, limit: requestBodyLimit }));

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api', { exclude: ['health/live', 'health/ready', 'docs', 'docs-json'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter(app.get(AppLogger)));

  if (runMigrations && process.env.NODE_ENV !== 'test') {
    if (process.env.NODE_ENV === 'production' && !allowProdStartupMigrations) {
      app.get(AppLogger).warn(
        'RUN_MIGRATIONS_ON_STARTUP is true but startup migrations are blocked in production unless ALLOW_PROD_STARTUP_MIGRATIONS=true',
        'Bootstrap',
      );
    }
    const dbUrl = configService.get<string>('DATABASE_URL');
    const canRun = process.env.NODE_ENV !== 'production' || allowProdStartupMigrations;
    if (dbUrl && canRun) {
      app.get(AppLogger).log('Running DB migrations at startup', 'Bootstrap');
      await runMigrationsOnStartup(dbUrl);
      app.get(AppLogger).log('DB migrations complete', 'Bootstrap');
    }
  }

  const shouldEnableSwagger = process.env.NODE_ENV !== 'production' || enableSwagger;
  if (shouldEnableSwagger) {
    if (process.env.NODE_ENV === 'production' && swaggerUser && swaggerPass) {
      app.use(['/docs', '/docs-json'], (req: Request, res: Response, next: NextFunction) => {
        const auth = req.headers.authorization;
        if (!auth?.startsWith('Basic ')) {
          res.setHeader('WWW-Authenticate', 'Basic realm="IFMS Swagger"');
          return res.status(401).send('Authentication required');
        }
        const encoded = auth.slice('Basic '.length);
        const [user, pass] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
        if (user !== swaggerUser || pass !== swaggerPass) {
          res.setHeader('WWW-Authenticate', 'Basic realm="IFMS Swagger"');
          return res.status(401).send('Invalid credentials');
        }
        return next();
      });
    }

    const swaggerConfig = new DocumentBuilder()
      .setTitle('IFMS API')
      .setDescription('Integrated Financial Management System – Backend API')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
        'access-token',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(port);
  app.get(AppLogger).log(`Application listening on port ${port}`, 'Bootstrap');
}

bootstrap().catch((err) => {
  console.error('Failed to start application', err);
  process.exit(1);
});
