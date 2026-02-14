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
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@ApiTags('payments')
@Controller('payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class PaymentsController extends BaseListController {
  constructor(private readonly paymentsService: PaymentsService) {
    super();
  }

  @Post()
  @Permissions('credit:write')
  @ApiOperation({ summary: 'Record payment (auto-allocate to oldest invoices or explicit allocations)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 400 })
  @ApiResponse({ status: 404 })
  async create(
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ) {
    return this.paymentsService.create(
      {
        customerId: dto.customerId,
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
  @Permissions('credit:read')
  @ApiOperation({ summary: 'List payments' })
  @ApiResponse({ status: 200 })
  async list(@Query() query: ListQueryDto & { branchId?: string; companyId?: string; customerId?: string; dateFrom?: string; dateTo?: string }) {
    const params = getListParams(query);
    const { data, total } = await this.paymentsService.findPage({
      page: query.page,
      pageSize: query.pageSize,
      branchId: query.branchId,
      companyId: query.companyId,
      customerId: query.customerId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    return this.listResponse(data, total, { page: params.page, pageSize: params.pageSize });
  }
}
