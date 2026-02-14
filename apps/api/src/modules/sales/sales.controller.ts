import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
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
import { SalesService, type SaleTransactionDetail, type SaleTransactionListItem } from './sales.service';
import { CreatePosSaleDto } from './dto/create-pos-sale.dto';
import { VoidTransactionDto } from './dto/void-transaction.dto';

@ApiTags('sales')
@Controller('sales')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class SalesController extends BaseListController {
  constructor(private readonly salesService: SalesService) {
    super();
  }

  @Post('pos')
  @Permissions('sales:pos')
  @ApiOperation({ summary: 'Create a POS sale' })
  @ApiResponse({ status: 201, description: 'Sale created' })
  @ApiResponse({ status: 400, description: 'Validation: payment sum vs total, discount reason, etc.' })
  async createPosSale(
    @Body() dto: CreatePosSaleDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<SaleTransactionDetail> {
    return this.salesService.createPosSale(dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('transactions')
  @Permissions('sales:read')
  @ApiOperation({ summary: 'List sale transactions' })
  @ApiResponse({ status: 200 })
  async list(
    @Query() query: ListQueryDto & { status?: string },
  ): Promise<ListResponse<SaleTransactionListItem>> {
    const params = getListParams(query);
    const { data, total } = await this.salesService.findPage({
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

  @Get('transactions/:id')
  @Permissions('sales:read')
  @ApiOperation({ summary: 'Get sale transaction by ID' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async getById(@Param('id') id: string): Promise<SaleTransactionDetail> {
    return this.salesService.findById(id);
  }

  @Post('transactions/:id/void')
  @Permissions('sales:void')
  @ApiOperation({ summary: 'Void a transaction (Manager only, requires reason)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'Already voided or missing reason' })
  @ApiResponse({ status: 404 })
  async void(
    @Param('id') id: string,
    @Body() dto: VoidTransactionDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<SaleTransactionDetail> {
    return this.salesService.voidTransaction(id, dto.reason, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
