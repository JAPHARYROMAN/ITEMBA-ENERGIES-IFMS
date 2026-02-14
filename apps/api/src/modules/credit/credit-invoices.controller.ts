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
import { CreditInvoicesService } from './credit-invoices.service';
import { CreateCreditInvoiceDto } from './dto/create-credit-invoice.dto';

@ApiTags('credit-invoices')
@Controller('credit-invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class CreditInvoicesController extends BaseListController {
  constructor(private readonly creditInvoicesService: CreditInvoicesService) {
    super();
  }

  @Post()
  @Permissions('credit:write')
  @ApiOperation({ summary: 'Create credit invoice' })
  @ApiResponse({ status: 201 })
  async create(
    @Body() dto: CreateCreditInvoiceDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ) {
    return this.creditInvoicesService.create(
      {
        customerId: dto.customerId,
        invoiceDate: dto.invoiceDate,
        dueDate: dto.dueDate,
        items: dto.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, tax: i.tax })),
      },
      { userId: user.sub, ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  @Get()
  @Permissions('credit:read')
  @ApiOperation({ summary: 'List credit invoices' })
  @ApiResponse({ status: 200 })
  async list(
    @Query() query: ListQueryDto & { branchId?: string; companyId?: string; customerId?: string; status?: string; dateFrom?: string; dateTo?: string },
  ): Promise<ListResponse<unknown>> {
    const params = getListParams(query);
    const { data, total } = await this.creditInvoicesService.findPage({
      page: query.page,
      pageSize: query.pageSize,
      branchId: query.branchId,
      companyId: query.companyId,
      customerId: query.customerId,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    return this.listResponse(data, total, { page: params.page, pageSize: params.pageSize });
  }
}
