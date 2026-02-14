import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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
import { CustomersService, type CustomerItem, type CustomersListParams } from './customers.service';
import { CreditStatementService, type CustomerStatement } from './credit-statement.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerNoteDto } from './dto/customer-note.dto';
import { CustomerActionDto } from './dto/customer-action.dto';

@ApiTags('customers')
@Controller('customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class CustomersController extends BaseListController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly statementService: CreditStatementService,
  ) {
    super();
  }

  @Get()
  @Permissions('credit:read')
  @ApiOperation({ summary: 'List customers' })
  @ApiResponse({ status: 200 })
  async list(@Query() query: ListQueryDto & CustomersListParams): Promise<ListResponse<CustomerItem>> {
    const params = getListParams(query);
    const { data, total } = await this.customersService.findPage({
      page: query.page,
      pageSize: query.pageSize,
      branchId: query.branchId,
      companyId: query.companyId,
      status: query.status,
      q: query.q,
    });
    return this.listResponse(data, total, { page: params.page, pageSize: params.pageSize });
  }

  @Get(':id/statement')
  @Permissions('credit:read')
  @ApiOperation({ summary: 'Get customer statement (opening balance, invoices, payments, running balance)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async getStatement(
    @Param('id') id: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
  ): Promise<CustomerStatement> {
    const from = dateFrom || new Date(0).toISOString().slice(0, 10);
    const to = dateTo || new Date().toISOString().slice(0, 10);
    return this.statementService.getStatement(id, from, to);
  }

  @Get(':id')
  @Permissions('credit:read')
  @ApiOperation({ summary: 'Get customer by ID' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async getById(@Param('id') id: string): Promise<CustomerItem> {
    return this.customersService.findById(id);
  }

  @Post()
  @Permissions('credit:write')
  @ApiOperation({ summary: 'Create customer' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 409 })
  async create(
    @Body() dto: CreateCustomerDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<CustomerItem> {
    return this.customersService.create(
      {
        branchId: dto.branchId,
        code: dto.code,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        taxId: dto.taxId,
        creditLimit: dto.creditLimit,
        paymentTerms: dto.paymentTerms,
        status: dto.status,
      },
      { userId: user.sub, ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  @Patch(':id')
  @Permissions('credit:write')
  @ApiOperation({ summary: 'Update customer' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<CustomerItem> {
    return this.customersService.update(id, dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('credit:write')
  @ApiOperation({ summary: 'Soft-delete customer' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404 })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<void> {
    await this.customersService.remove(id, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':id/notes')
  @Permissions('credit:read')
  @ApiOperation({ summary: 'Add internal customer note (audit logged)' })
  @ApiResponse({ status: 201 })
  async addNote(
    @Param('id') id: string,
    @Body() dto: CustomerNoteDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<{ ok: true; id: string }> {
    return this.customersService.addNote(id, dto.note, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':id/actions')
  @Permissions('credit:read')
  @ApiOperation({ summary: 'Record customer-side operational action' })
  @ApiResponse({ status: 201 })
  async recordAction(
    @Param('id') id: string,
    @Body() dto: CustomerActionDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<{ ok: true; action: string }> {
    return this.customersService.recordAction(id, dto.action, { note: dto.note, ...dto.payload }, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
