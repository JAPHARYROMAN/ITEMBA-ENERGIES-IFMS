import { Body, Controller, Get, Header, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser, type JwtPayloadUser } from '../auth/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { ReportsQueryDto } from './dto/reports-query.dto';
import { ReportActionDto } from './dto/report-action.dto';
import type { ReportScopeContext } from './reports.service';

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('overview')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Permissions('reports:read')
  @Header('Cache-Control', 'private, max-age=30')
  @ApiOperation({ summary: 'Overview analytics payload' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async overview(
    @Query() query: ReportsQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    const payload = await this.reportsService.getOverview(query, {
      endpoint: '/reports/overview',
      correlationId: (req as Request & { id?: string }).id ?? 'n/a',
      scope: this.getScope(user, query),
    });
    return this.respondWithEtag(req, res, payload);
  }

  @Get('daily-operations')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Permissions('reports:read')
  @Header('Cache-Control', 'private, max-age=30')
  @ApiOperation({ summary: 'Daily operations report payload' })
  @ApiResponse({ status: 200 })
  async dailyOperations(
    @Query() query: ReportsQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    const payload = await this.reportsService.getDailyOperations(query, {
      endpoint: '/reports/daily-operations',
      correlationId: (req as Request & { id?: string }).id ?? 'n/a',
      scope: this.getScope(user, query),
    });
    return this.respondWithEtag(req, res, payload);
  }

  @Get('stock-loss')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Permissions('reports:read')
  @Header('Cache-Control', 'private, max-age=30')
  @ApiOperation({ summary: 'Stock loss report payload' })
  @ApiResponse({ status: 200 })
  async stockLoss(
    @Query() query: ReportsQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    const payload = await this.reportsService.getStockLoss(query, {
      endpoint: '/reports/stock-loss',
      correlationId: (req as Request & { id?: string }).id ?? 'n/a',
      scope: this.getScope(user, query),
    });
    return this.respondWithEtag(req, res, payload);
  }

  @Get('profitability')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Permissions('reports:read')
  @Header('Cache-Control', 'private, max-age=30')
  @ApiOperation({ summary: 'Profitability report payload' })
  @ApiResponse({ status: 200 })
  async profitability(
    @Query() query: ReportsQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    const payload = await this.reportsService.getProfitability(query, {
      endpoint: '/reports/profitability',
      correlationId: (req as Request & { id?: string }).id ?? 'n/a',
      scope: this.getScope(user, query),
    });
    return this.respondWithEtag(req, res, payload);
  }

  @Get('credit-cashflow')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Permissions('reports:read')
  @Header('Cache-Control', 'private, max-age=30')
  @ApiOperation({ summary: 'Credit and cashflow report payload' })
  @ApiResponse({ status: 200 })
  async creditCashflow(
    @Query() query: ReportsQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    const payload = await this.reportsService.getCreditCashflow(query, {
      endpoint: '/reports/credit-cashflow',
      correlationId: (req as Request & { id?: string }).id ?? 'n/a',
      scope: this.getScope(user, query),
    });
    return this.respondWithEtag(req, res, payload);
  }

  @Get('station-comparison')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Permissions('reports:read')
  @Header('Cache-Control', 'private, max-age=30')
  @ApiOperation({ summary: 'Station comparison report payload' })
  @ApiResponse({ status: 200 })
  async stationComparison(
    @Query() query: ReportsQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    const payload = await this.reportsService.getStationComparison(query, {
      endpoint: '/reports/station-comparison',
      correlationId: (req as Request & { id?: string }).id ?? 'n/a',
      scope: this.getScope(user, query),
    });
    return this.respondWithEtag(req, res, payload);
  }

  @Post('actions')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Permissions('reports:read')
  @ApiOperation({ summary: 'Record report-side operational action' })
  @ApiResponse({ status: 201 })
  recordAction(
    @Body() dto: ReportActionDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ) {
    return this.reportsService.recordAction(dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  private respondWithEtag(req: Request, res: Response, payload: unknown) {
    const etag = this.makeEtag(payload);
    res.setHeader('ETag', etag);
    const incoming = req.headers['if-none-match'];
    if (typeof incoming === 'string' && incoming === etag) {
      res.status(304);
      return;
    }
    return payload;
  }

  private makeEtag(payload: unknown): string {
    const digest = createHash('sha256').update(this.stableStringify(payload)).digest('base64url');
    return `"${digest}"`;
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((v) => this.stableStringify(v)).join(',')}]`;
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${this.stableStringify(v)}`)
      .join(',')}}`;
  }

  private getScope(user: JwtPayloadUser, query: ReportsQueryDto): ReportScopeContext {
    const scoped = this.parsePermissionScope(user.permissions);
    return {
      userId: user.sub,
      permissions: user.permissions,
      companyId: query.companyId ?? scoped.companyId,
      branchId: query.branchId ?? scoped.branchId,
    };
  }

  private parsePermissionScope(permissions: string[]): { companyId?: string; branchId?: string } {
    const company = permissions
      .map((p) => p.match(/^company:([0-9a-fA-F-]{36})$/)?.[1])
      .find(Boolean);
    const branch = permissions
      .map((p) => p.match(/^branch:([0-9a-fA-F-]{36})$/)?.[1])
      .find(Boolean);
    return {
      companyId: company || undefined,
      branchId: branch || undefined,
    };
  }
}
