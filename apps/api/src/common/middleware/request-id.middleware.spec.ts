import { RequestIdMiddleware, REQUEST_ID_HEADER } from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  const middleware = new RequestIdMiddleware();

  function run(headers: Record<string, unknown>) {
    const req: any = { headers };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();
    middleware.use(req, res, next);
    return { req, res, next };
  }

  it('reuses an incoming x-request-id header', () => {
    const { req, res, next } = run({ [REQUEST_ID_HEADER]: 'incoming-id' });
    expect(req.id).toBe('incoming-id');
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'incoming-id');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a UUID when no header is present', () => {
    const { req, res } = run({});
    expect(req.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.id);
  });

  it('generates a UUID when the header is an empty string', () => {
    const { req } = run({ [REQUEST_ID_HEADER]: '' });
    expect(req.id).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
