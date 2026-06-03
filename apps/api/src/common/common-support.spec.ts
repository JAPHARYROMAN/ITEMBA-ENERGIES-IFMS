import 'reflect-metadata';
import { BadRequestException, ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import { plainToInstance, Transform } from 'class-transformer';
import { validate } from 'class-validator';
import { EventEmitter } from 'node:events';
import { BaseListController } from './base/base-list.controller';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { createListResponse, getListParams } from './helpers/list.helper';
import { SanitizeHtml } from './decorators/sanitize.decorator';
import { sanitizeText } from './helpers/sanitize.helper';
import { buildListResponse } from './interfaces/response-envelope';
import { AppLogger } from './logger/logger.service';
import { RequestIdMiddleware, REQUEST_ID_HEADER } from './middleware/request-id.middleware';
import { RequestLoggingMiddleware } from './middleware/request-logging.middleware';
import { OpsMetricsService } from './ops/ops-metrics.service';
import { normalizePagination } from './dto/pagination.dto';
import { parseSort } from './dto/sort.dto';
import { ListFilterDto } from './dto/list-filter.dto';
import { ListQueryDto } from './dto/list-query.dto';
import * as CommonDto from './dto';
import { throwConflictIfUniqueViolation } from './utils/db-errors';

class TestListController extends BaseListController {
  exposeListResponse<T>(data: T[], total: number, query: { page?: number; pageSize?: number }) {
    return this.listResponse(data, total, query);
  }

  exposeListParams(query: { page?: number; pageSize?: number }) {
    return this.getListParams(query);
  }
}

class SanitizedDto {
  @SanitizeHtml()
  value!: string;

  @Transform(({ value }) => value)
  passthrough!: string;
}

describe('common DTOs and helpers', () => {
  it('normalizes pagination, sorting, list envelopes, and DTO barrel exports', () => {
    expect(normalizePagination(0, 500)).toEqual({ page: 1, pageSize: 100, offset: 0, limit: 100 });
    expect(getListParams({ page: 3, pageSize: 10 })).toEqual({
      page: 3,
      pageSize: 10,
      offset: 20,
      limit: 10,
    });
    expect(parseSort('created_at:DESC')).toEqual({ field: 'created_at', direction: 'desc' });
    expect(parseSort('bad-sort')).toBeNull();
    expect(parseSort()).toBeNull();

    const response = createListResponse([{ id: 1 }], 7, 2, 25);
    expect(response).toEqual(buildListResponse([{ id: 1 }], { page: 2, pageSize: 25, total: 7 }));

    const controller = new TestListController();
    expect(controller.exposeListResponse(['a'], 1, { page: 1, pageSize: 1 })).toEqual({
      data: ['a'],
      meta: { page: 1, pageSize: 1, total: 1 },
    });
    expect(controller.exposeListParams({ page: -1, pageSize: -5 })).toMatchObject({
      page: 1,
      pageSize: 1,
    });

    expect(new CommonDto.PaginationDto().page).toBe(1);
    expect(new CommonDto.ListQueryDto().pageSize).toBe(25);
    expect(CommonDto.parseSort('name:asc')).toEqual({ field: 'name', direction: 'asc' });
  });

  it('validates list query and filter DTOs while transforming numeric query strings', async () => {
    const listQuery = plainToInstance(ListQueryDto, {
      page: '2',
      pageSize: '101',
      sort: 'created_at:up',
      companyId: 'not-a-uuid',
      dateFrom: 'not-a-date',
    });
    const queryErrors = await validate(listQuery);

    expect(listQuery.page).toBe(2);
    expect(queryErrors.map((e) => e.property)).toEqual(
      expect.arrayContaining(['pageSize', 'sort', 'companyId', 'dateFrom']),
    );

    const listFilter = plainToInstance(ListFilterDto, {
      q: 'x'.repeat(201),
      branchId: 'bad',
    });
    const filterErrors = await validate(listFilter);
    expect(filterErrors.map((e) => e.property)).toEqual(expect.arrayContaining(['q', 'branchId']));
  });

  it('sanitizes helper and decorator string input only', () => {
    expect(sanitizeText(' <b>Hello</b> ')).toBe('Hello');

    const dto = plainToInstance(SanitizedDto, {
      value: ' <script>x</script>ok ',
      passthrough: 'same',
    });
    expect(dto.value).toBe('xok');
    expect(dto.passthrough).toBe('same');
  });

  it('maps unique constraint errors to conflicts and rethrows other errors', () => {
    expect(() =>
      throwConflictIfUniqueViolation(Object.assign(new Error('duplicate'), { code: '23505' }), 'Duplicate'),
    ).toThrow(ConflictException);

    const original = Object.assign(new Error('other'), { code: '22000' });
    expect(() => throwConflictIfUniqueViolation(original, 'Duplicate')).toThrow(original);
  });
});

describe('HttpExceptionFilter', () => {
  const makeResponse = () => {
    type MockResponse = {
      statusCode: number;
      body: unknown;
      status: jest.Mock;
      json: jest.Mock;
    };
    const response: MockResponse = {
      statusCode: 200,
      body: undefined as unknown,
      status: jest.fn(function (this: MockResponse, code: number) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn(function (this: MockResponse, body: unknown) {
        this.body = body;
        return this;
      }),
    };
    return response;
  };

  const hostFor = (request: Record<string, unknown>, response: ReturnType<typeof makeResponse>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    }) as any;

  it('serializes HttpException responses with request id and logs the failure', () => {
    const logger = { error: jest.fn() };
    const filter = new HttpExceptionFilter(logger as any);
    const response = makeResponse();
    const request = { id: 'req-1', method: 'POST', url: '/api/test' };

    filter.catch(new BadRequestException({ message: ['bad input'] }), hostFor(request, response));

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
        message: ['bad input'],
        path: '/api/test',
        requestId: 'req-1',
      }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('[POST] /api/test 400 - bad input'),
      expect.any(String),
      'HttpExceptionFilter',
    );
  });

  it.each([
    ['23505', HttpStatus.CONFLICT, 'A record with these details already exists.'],
    ['23503', HttpStatus.BAD_REQUEST, 'The referenced record does not exist or has been removed.'],
    ['23514', HttpStatus.BAD_REQUEST, 'A data constraint was violated. Please check your input.'],
    ['23502', HttpStatus.BAD_REQUEST, 'A required field is missing.'],
    ['23506', HttpStatus.CONFLICT, 'This record conflicts with an existing entry.'],
    ['42P01', HttpStatus.INTERNAL_SERVER_ERROR, 'Database configuration error. Please contact support.'],
    ['57014', HttpStatus.GATEWAY_TIMEOUT, 'The operation took too long. Please try again or narrow your query.'],
    ['53300', HttpStatus.SERVICE_UNAVAILABLE, 'The server is temporarily overloaded. Please try again shortly.'],
    ['53400', HttpStatus.SERVICE_UNAVAILABLE, 'The server is temporarily overloaded. Please try again shortly.'],
  ])('normalizes PostgreSQL error code %s', (code, statusCode, message) => {
    const filter = new HttpExceptionFilter({ error: jest.fn() } as any);
    const normalize = (filter as any).normalizeException.bind(filter);

    expect(normalize(Object.assign(new Error('db failed'), { code }))).toEqual({
      statusCode,
      message,
    });
  });

  it('normalizes unknown, development, production, and fallback status-name errors', () => {
    const filter = new HttpExceptionFilter({ error: jest.fn() } as any);
    const normalize = (filter as any).normalizeException.bind(filter);
    const response = makeResponse();

    expect(normalize('not an error')).toEqual({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
    expect(normalize(new Error('dev detail'))).toMatchObject({ message: 'dev detail' });

    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(normalize(new Error('secret'))).toMatchObject({ message: 'Internal server error' });
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }

    filter.catch(new HttpException('teapot', 418), hostFor({ method: 'GET', url: '/tea' }, response));
    expect(response.body).toEqual(expect.objectContaining({ statusCode: 418, error: 'Error' }));
  });
});

describe('common middleware, logger, and metrics', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses an incoming request id or generates one and sets the response header', () => {
    const middleware = new RequestIdMiddleware();
    const next = jest.fn();
    const response = { setHeader: jest.fn() };
    const requestWithId = { headers: { [REQUEST_ID_HEADER]: 'req-existing' } };

    middleware.use(requestWithId as any, response as any, next);
    expect((requestWithId as any).id).toBe('req-existing');
    expect(response.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'req-existing');
    expect(next).toHaveBeenCalled();

    const generatedReq = { headers: {} };
    middleware.use(generatedReq as any, response as any, next);
    expect((generatedReq as any).id).toEqual(expect.any(String));
    expect(response.setHeader).toHaveBeenLastCalledWith(REQUEST_ID_HEADER, (generatedReq as any).id);
  });

  it('logs request start/end and records request duration on response finish', () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1042);
    const logger = { log: jest.fn() };
    const metrics = { recordRequest: jest.fn() };
    const middleware = new RequestLoggingMiddleware(logger as any, metrics as any);
    const response = new EventEmitter() as EventEmitter & { statusCode: number };
    response.statusCode = 201;
    const next = jest.fn();

    middleware.use(
      { id: 'req-1', method: 'GET', originalUrl: '/api/reports' } as any,
      response as any,
      next,
    );
    response.emit('finish');

    expect(next).toHaveBeenCalled();
    expect(metrics.recordRequest).toHaveBeenCalledWith(42);
    expect(logger.log).toHaveBeenCalledWith(
      'request:start id=req-1 method=GET path=/api/reports',
      'HTTP',
    );
    expect(logger.log).toHaveBeenCalledWith(
      'request:end id=req-1 method=GET path=/api/reports status=201 durationMs=42',
      'HTTP',
    );
  });

  it('writes structured logger lines to stdout and errors with trace to stderr', () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const logger = new AppLogger();

    logger.setContext('DefaultContext');
    logger.log('hello');
    logger.warn('careful', 'OverrideContext');
    logger.debug('debugging');
    logger.verbose('details');
    logger.error('failed', 'stack trace', 'ErrorContext');

    const firstLine = JSON.parse(String(stdout.mock.calls[0][0]));
    expect(firstLine).toMatchObject({
      level: 'info',
      message: 'hello',
      context: 'DefaultContext',
    });
    expect(stdout.mock.calls.some((call) => String(call[0]).includes('"level":"warn"'))).toBe(true);
    expect(stdout.mock.calls.some((call) => String(call[0]).includes('"level":"debug"'))).toBe(true);
    expect(stdout.mock.calls.some((call) => String(call[0]).includes('"level":"verbose"'))).toBe(true);
    expect(stderr.mock.calls[0][0]).toEqual(expect.stringContaining('"context":"ErrorContext"'));
    expect(stderr.mock.calls[1][0]).toBe('stack trace\n');
  });

  it('records request latency buckets and report-cache hit rate snapshots', () => {
    const metrics = new OpsMetricsService();

    metrics.recordRequest(50);
    metrics.recordRequest(300);
    metrics.recordRequest(10_001);
    metrics.recordReportCacheHit();
    metrics.recordReportCacheHit();
    metrics.recordReportCacheMiss();

    expect(metrics.snapshot()).toEqual(
      expect.objectContaining({
        requests: {
          total: 3,
          latencyBuckets: {
            le_100ms: 1,
            le_300ms: 1,
            gt_10000ms: 1,
          },
        },
        reportsCache: {
          hits: 2,
          misses: 1,
          hitRate: 0.6667,
        },
      }),
    );
    expect(new OpsMetricsService().snapshot().reportsCache.hitRate).toBe(0);
  });
});
