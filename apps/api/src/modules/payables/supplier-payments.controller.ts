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
import { SupplierPaymentsService } from './supplier-payments.service';
import { CreateSupplierPaymentDto } from './dto/create-supplier-payment.dto';

@ApiTags('supplier-payments')
@Controller('supplier-payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class SupplierPaymentsController extends BaseListController {
  constructor(private readonly supplierPaymentsService: SupplierPaymentsService) {
    super();
  }

  @Post()
  @Permissions('payables:write')
  @ApiOperation({ summary: 'Record supplier payment' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 400 })
  @ApiResponse({ status: 404 })
  async create(@Body() dto: CreateSupplierPaymentDto, @CurrentUser() user: JwtPayloadUser, @Req() req: Request) {
    return this.supplierPaymentsService.create(
      {
        branchId: dto.branchId,
        supplierId: dto.supplierId,
        amount: dto.amount,
        method: dto.method,
        paymentDate: dto.paymentDate,
        referenceNo: dto.referenceNo,
        allocations: dto.allocations,
      },
      { userId: user.sub, ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  @Get()
  @Permissions('payables:read')
  @ApiOperation({ summary: 'List supplier payments' })
  @ApiResponse({ status: 200 })
  async list(@Query() query: ListQueryDto & { branchId?: string; companyId?: string; supplierId?: string; dateFrom?: string; dateTo?: string }): Promise<ListResponse<unknown>> {
    const params = getListParams(query);
    const { data, total } = await this.supplierPaymentsService.findPage({
      page: query.page,
      pageSize: query.pageSize,
      branchId: query.branchId,
      companyId: query.companyId,
      supplierId: query.supplierId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    return this.listResponse(data, total, { page: params.page, pageSize: params.pageSize });
  }
}
