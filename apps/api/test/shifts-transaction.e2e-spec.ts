import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request = require('supertest');
import { ShiftsController } from '../src/modules/shifts/shifts.controller';
import { ShiftsService } from '../src/modules/shifts/shifts.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../src/modules/auth/guards/permissions.guard';

describe('Shifts Open/Close Transaction (e2e)', () => {
  let app: INestApplication;
  const shiftsServiceMock = {
    open: jest.fn(),
    close: jest.fn(),
    findPage: jest.fn(),
    findById: jest.fn(),
    submitForApproval: jest.fn(),
    approve: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ShiftsController],
      providers: [{ provide: ShiftsService, useValue: shiftsServiceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { sub: 'manager-1', email: 'manager@ifms.com', permissions: ['shifts:open', 'shifts:close'] };
          return true;
        },
      })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('opens then closes a shift via API', async () => {
    shiftsServiceMock.open.mockResolvedValueOnce({
      id: 'shift-1',
      status: 'open',
      startTime: new Date().toISOString(),
    });
    shiftsServiceMock.close.mockResolvedValueOnce({
      id: 'shift-1',
      status: 'closed',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
    });

    const openRes = await request(app.getHttpServer())
      .post('/shifts/open')
      .set('Authorization', 'Bearer token')
      .send({
        branchId: '11111111-1111-1111-1111-111111111111',
        openingMeterReadings: [],
      })
      .expect(201);

    expect(openRes.body.status).toBe('open');

    const closeRes = await request(app.getHttpServer())
      .post('/shifts/shift-1/close')
      .set('Authorization', 'Bearer token')
      .send({
        closingMeterReadings: [],
        collections: [],
      })
      .expect(201);

    expect(closeRes.body.status).toBe('closed');
  });
});
