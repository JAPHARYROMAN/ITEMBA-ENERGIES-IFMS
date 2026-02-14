import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request = require('supertest');
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';

describe('Auth Flow (e2e)', () => {
  let app: INestApplication;

  const authServiceMock = {
    validateUser: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    getMe: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authServiceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { sub: 'user-1', email: 'admin@ifms.com', permissions: [] };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('logs in and returns token pair', async () => {
    authServiceMock.validateUser.mockResolvedValueOnce({
      id: 'user-1',
      email: 'admin@ifms.com',
      name: 'Admin',
    });
    authServiceMock.login.mockResolvedValueOnce({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 900,
    });

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@ifms.com', password: 'Admin123!' })
      .expect(201);

    expect(res.body.accessToken).toBe('access-token');
    expect(res.body.refreshToken).toBe('refresh-token');
  });

  it('refreshes and resolves me', async () => {
    authServiceMock.refresh.mockResolvedValueOnce({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 900,
    });
    authServiceMock.getMe.mockResolvedValueOnce({
      id: 'user-1',
      email: 'admin@ifms.com',
      name: 'Admin',
      status: 'active',
      permissions: ['reports:read'],
    });

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'refresh-token' })
      .expect(201);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(me.body.id).toBe('user-1');
    expect(Array.isArray(me.body.permissions)).toBe(true);
  });
});
