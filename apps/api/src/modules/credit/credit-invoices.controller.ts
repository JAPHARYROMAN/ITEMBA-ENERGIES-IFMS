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
import { CreditInvoicesService, type CreditInvoiceListItem, type CreditInvoiceDetail } from './credit-invoices.service';
import { CreateCreditInvoiceDto } from './dto/create-credit-invoice.dto';
import { UpdateCreditInvoiceDto } from './dto/update-credit-invoice.dto';

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
    @Query() query: ListQueryDto,
  ): Promise<ListResponse<CreditInvoiceListItem>> {
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

  @Get(':id')
  @Permissions('credit:read')
  @ApiOperation({ summary: 'Get credit invoice by ID' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Credit invoice not found' })
  async getById(@Param('id', ParseUUIDPipe) id: string): Promise<CreditInvoiceDetail> {
    return this.creditInvoicesService.getById(id);
  }

  @Patch(':id')
  @Permissions('credit:write')
  @ApiOperation({ summary: 'Update an unpaid credit invoice' })
  @ApiResponse({ status: 200, description: 'Invoice updated' })
  @ApiResponse({ status: 400, description: 'Only unpaid invoices can be updated' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async updateInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCreditInvoiceDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ) {
    return this.creditInvoicesService.update(id, dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Delete(':id')
  @Permissions('credit:write')
  @ApiOperation({ summary: 'Void a credit invoice and reverse customer balance' })
  @ApiResponse({ status: 200, description: 'Invoice voided' })
  @ApiResponse({ status: 400, description: 'Invoice has payments, void them first' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async deleteInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @CurrentUser() user: JwtPayloadUser,
  ): Promise<{ success: boolean }> {
    return this.creditInvoicesService.deleteInvoice(id, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
