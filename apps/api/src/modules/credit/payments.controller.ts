import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
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
  async list(@Query() query: ListQueryDto) {
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

  @Get(':id')
  @Permissions('credit:read')
  @ApiOperation({ summary: 'Get payment by ID with allocations' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Credit payment not found' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.getById(id);
  }

  @Post(':id/void')
  @Permissions('credit:write')
  @ApiOperation({ summary: 'Void credit payment and reverse invoice allocations' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async voidPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ) {
    return this.paymentsService.voidPayment(id, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
