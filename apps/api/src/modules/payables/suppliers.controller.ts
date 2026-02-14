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
import { SuppliersService, type SupplierItem, type SuppliersListParams } from './suppliers.service';
import { SupplierStatementService, type SupplierStatement } from './supplier-statement.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@ApiTags('suppliers')
@Controller('suppliers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class SuppliersController extends BaseListController {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly statementService: SupplierStatementService,
  ) {
    super();
  }

  @Get()
  @Permissions('payables:read')
  @ApiOperation({ summary: 'List suppliers' })
  @ApiResponse({ status: 200 })
  async list(@Query() query: ListQueryDto & SuppliersListParams): Promise<ListResponse<SupplierItem>> {
    const params = getListParams(query);
    const { data, total } = await this.suppliersService.findPage({
      page: query.page,
      pageSize: query.pageSize,
      companyId: query.companyId,
      status: query.status,
      q: query.q,
    });
    return this.listResponse(data, total, { page: params.page, pageSize: params.pageSize });
  }

  @Get(':id/statement')
  @Permissions('payables:read')
  @ApiOperation({ summary: 'Get supplier statement (opening balance, invoices, payments, running balance)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async getStatement(
    @Param('id') id: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
  ): Promise<SupplierStatement> {
    const from = dateFrom || new Date(0).toISOString().slice(0, 10);
    const to = dateTo || new Date().toISOString().slice(0, 10);
    return this.statementService.getStatement(id, from, to);
  }

  @Get(':id')
  @Permissions('payables:read')
  @ApiOperation({ summary: 'Get supplier by ID' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async getById(@Param('id') id: string): Promise<SupplierItem> {
    return this.suppliersService.findById(id);
  }

  @Post()
  @Permissions('payables:write')
  @ApiOperation({ summary: 'Create supplier' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 409 })
  async create(
    @Body() dto: CreateSupplierDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<SupplierItem> {
    return this.suppliersService.create(
      { companyId: dto.companyId, code: dto.code, name: dto.name, category: dto.category, rating: dto.rating, status: dto.status },
      { userId: user.sub, ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  @Patch(':id')
  @Permissions('payables:write')
  @ApiOperation({ summary: 'Update supplier' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<SupplierItem> {
    return this.suppliersService.update(id, dto, { userId: user.sub, ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('payables:write')
  @ApiOperation({ summary: 'Soft-delete supplier' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404 })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<void> {
    await this.suppliersService.remove(id, { userId: user.sub, ip: req.ip, userAgent: req.headers['user-agent'] });
  }
}
