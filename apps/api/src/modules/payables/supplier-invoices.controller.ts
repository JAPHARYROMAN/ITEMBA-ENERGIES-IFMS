import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
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
import { SupplierInvoicesService, type SupplierInvoiceItem } from './supplier-invoices.service';
import { CreateSupplierInvoiceDto } from './dto/create-supplier-invoice.dto';
import { UpdateSupplierInvoiceDto } from './dto/update-supplier-invoice.dto';

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
  async list(@Query() query: ListQueryDto): Promise<ListResponse<SupplierInvoiceItem>> {
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

  @Get(':id')
  @Permissions('payables:read')
  @ApiOperation({ summary: 'Get supplier invoice by ID' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Supplier invoice not found' })
  async getById(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierInvoiceItem> {
    return this.supplierInvoicesService.findById(id);
  }

  @Patch(':id')
  @Permissions('payables:write')
  @ApiOperation({ summary: 'Update a supplier invoice (unpaid/partial only)' })
  @ApiResponse({ status: 200, description: 'Invoice updated' })
  @ApiResponse({ status: 400, description: 'Cannot update voided or paid invoice' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async updateInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierInvoiceDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<SupplierInvoiceItem> {
    return this.supplierInvoicesService.update(id, dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Delete(':id')
  @Permissions('payables:write')
  @ApiOperation({ summary: 'Void a supplier invoice and reverse supplier balance' })
  @ApiResponse({ status: 200, description: 'Invoice voided' })
  @ApiResponse({ status: 400, description: 'Invoice has payments, void them first' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async deleteInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @CurrentUser() user: JwtPayloadUser,
  ): Promise<{ success: boolean }> {
    return this.supplierInvoicesService.deleteInvoice(id, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
