import { RequestLoggingMiddleware } from './request-logging.middleware';

describe('RequestLoggingMiddleware', () => {
  let logger: { log: jest.Mock };
  let opsMetrics: { recordRequest: jest.Mock };
  let middleware: RequestLoggingMiddleware;

  beforeEach(() => {
    logger = { log: jest.fn() };
    opsMetrics = { recordRequest: jest.fn() };
    middleware = new RequestLoggingMiddleware(logger as any, opsMetrics as any);
  });

  function makeRes() {
    const handlers: Record<string, () => void> = {};
    return {
      statusCode: 200,
      on: jest.fn((event: string, cb: () => void) => {
        handlers[event] = cb;
      }),
      emit: (event: string) => handlers[event]?.(),
    };
  }

  it('logs the start of a request with the request id when present', () => {
    const req: any = { id: 'req-1', method: 'GET', originalUrl: '/health' };
    const res = makeRes();
    const next = jest.fn();

    middleware.use(req, res as any, next);

    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('request:start id=req-1'), 'HTTP');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('falls back to n/a when the request has no id', () => {
    const req: any = { method: 'POST', originalUrl: '/x' };
    const res = makeRes();
    middleware.use(req, res as any, jest.fn());
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('id=n/a'), 'HTTP');
  });

  it('records metrics and logs completion when the response finishes', () => {
    const req: any = { id: 'req-2', method: 'GET', originalUrl: '/health' };
    const res = makeRes();
    middleware.use(req, res as any, jest.fn());

    res.statusCode = 404;
    res.emit('finish');

    expect(opsMetrics.recordRequest).toHaveBeenCalledTimes(1);
    expect(opsMetrics.recordRequest).toHaveBeenCalledWith(expect.any(Number));
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('request:end id=req-2'), 'HTTP');
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('status=404'), 'HTTP');
  });
});
