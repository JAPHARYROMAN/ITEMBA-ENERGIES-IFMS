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
import { SupplierInvoicesService } from './supplier-invoices.service';
import { CreateSupplierInvoiceDto } from './dto/create-supplier-invoice.dto';

@ApiTags('supplier-invoices')
@Controller('supplier-invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class SupplierInvoicesController extends BaseListController {
  constructor(private readonly supplierInvoicesService: SupplierInvoicesService) {
    super();
  }

  @Post()
  @Permissions('payables:write')
  @ApiOperation({ summary: 'Create supplier invoice' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 404 })
  async create(@Body() dto: CreateSupplierInvoiceDto, @CurrentUser() user: JwtPayloadUser, @Req() req: Request) {
    return this.supplierInvoicesService.create(
      {
        branchId: dto.branchId,
        supplierId: dto.supplierId,
        invoiceNumber: dto.invoiceNumber,
        invoiceDate: dto.invoiceDate,
        dueDate: dto.dueDate,
        totalAmount: dto.totalAmount,
      },
      { userId: user.sub, ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  @Get()
  @Permissions('payables:read')
  @ApiOperation({ summary: 'List supplier invoices' })
  @ApiResponse({ status: 200 })
  async list(@Query() query: ListQueryDto & { branchId?: string; companyId?: string; supplierId?: string; status?: string; dateFrom?: string; dateTo?: string }): Promise<ListResponse<unknown>> {
    const params = getListParams(query);
    const { data, total } = await this.supplierInvoicesService.findPage({
      page: query.page,
      pageSize: query.pageSize,
      branchId: query.branchId,
      companyId: query.companyId,
      supplierId: query.supplierId,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    return this.listResponse(data, total, { page: params.page, pageSize: params.pageSize });
  }
}
