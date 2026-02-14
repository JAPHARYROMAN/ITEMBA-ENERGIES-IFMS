import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../auth/decorators/current-user.decorator';
import { BaseListController } from '../../common/base/base-list.controller';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import type { ListResponse } from '../../common/interfaces/response-envelope';
import { getListParams } from '../../common/helpers/list.helper';
import {
  InventoryService,
  type TankDipItem,
  type ReconciliationItem,
  type VarianceItem,
} from './inventory.service';
import { CreateDipDto } from './dto/create-dip.dto';
import { CreateReconciliationDto } from './dto/create-reconciliation.dto';

@ApiTags('inventory')
@Controller('inventory')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class InventoryController extends BaseListController {
  constructor(private readonly inventoryService: InventoryService) {
    super();
  }

  @Post('dips')
  @Permissions('inventory:write')
  @ApiOperation({ summary: 'Record a tank dip' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 404, description: 'Branch or tank not found' })
  async createDip(
    @Body() dto: CreateDipDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<TankDipItem> {
    return this.inventoryService.createDip(dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('dips')
  @Permissions('inventory:read')
  @ApiOperation({ summary: 'List tank dips (date range indexed)' })
  @ApiResponse({ status: 200 })
  async listDips(
    @Query() query: ListQueryDto & { branchId?: string; tankId?: string; dateFrom?: string; dateTo?: string },
  ): Promise<ListResponse<TankDipItem>> {
    const params = getListParams(query);
    const { data, total } = await this.inventoryService.findDipsPage({
      page: query.page,
      pageSize: query.pageSize,
      branchId: query.branchId,
      tankId: query.tankId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    return this.listResponse(data, total, { page: params.page, pageSize: params.pageSize });
  }

  @Post('reconciliations')
  @Permissions('inventory:write')
  @ApiOperation({ summary: 'Create reconciliation (book vs physical stock)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async createReconciliation(
    @Body() dto: CreateReconciliationDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<ReconciliationItem> {
    return this.inventoryService.createReconciliation(dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('reconciliations')
  @Permissions('inventory:read')
  @ApiOperation({ summary: 'List reconciliations (date range indexed)' })
  @ApiResponse({ status: 200 })
  async listReconciliations(
    @Query() query: ListQueryDto & { branchId?: string; companyId?: string; status?: string; dateFrom?: string; dateTo?: string },
  ): Promise<ListResponse<ReconciliationItem>> {
    const params = getListParams(query);
    const { data, total } = await this.inventoryService.findReconciliationsPage({
      page: query.page,
      pageSize: query.pageSize,
      branchId: query.branchId,
      companyId: query.companyId,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    return this.listResponse(data, total, { page: params.page, pageSize: params.pageSize });
  }

  @Get('variances')
  @Permissions('inventory:read')
  @ApiOperation({ summary: 'List variances (date range indexed)' })
  @ApiResponse({ status: 200 })
  async listVariances(
    @Query() query: ListQueryDto & { branchId?: string; companyId?: string; tankId?: string; classification?: string; dateFrom?: string; dateTo?: string },
  ): Promise<ListResponse<VarianceItem>> {
    const params = getListParams(query);
    const { data, total } = await this.inventoryService.findVariancesPage({
      page: query.page,
      pageSize: query.pageSize,
      branchId: query.branchId,
      companyId: query.companyId,
      tankId: query.tankId,
      classification: query.classification,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    return this.listResponse(data, total, { page: params.page, pageSize: params.pageSize });
  }
}
