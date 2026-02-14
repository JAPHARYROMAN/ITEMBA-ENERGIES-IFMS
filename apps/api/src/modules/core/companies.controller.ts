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
import { CompaniesService, type CompanyItem } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@ApiTags('core')
@Controller('companies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class CompaniesController extends BaseListController {
  constructor(private readonly companiesService: CompaniesService) {
    super();
  }

  @Get()
  @Permissions('setup:read', 'reports:read')
  @ApiOperation({ summary: 'List companies (paginated, sortable, filterable)' })
  @ApiResponse({ status: 200, description: 'Paginated list with data + meta' })
  async list(@Query() query: ListQueryDto): Promise<ListResponse<CompanyItem>> {
    const params = getListParams(query);
    const { data, total } = await this.companiesService.findPage({
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      q: query.q,
    });
    return this.listResponse(data, total, { page: params.page, pageSize: params.pageSize });
  }

  @Get(':id')
  @Permissions('setup:read', 'reports:read')
  @ApiOperation({ summary: 'Get company by ID' })
  @ApiResponse({ status: 200, description: 'Company' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  async getById(@Param('id') id: string): Promise<CompanyItem> {
    return this.companiesService.findById(id);
  }

  @Post()
  @Permissions('setup:write')
  @ApiOperation({ summary: 'Create company' })
  @ApiResponse({ status: 201, description: 'Company created' })
  @ApiResponse({ status: 409, description: 'Code already exists' })
  async create(
    @Body() dto: CreateCompanyDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<CompanyItem> {
    return this.companiesService.create(
      { code: dto.code, name: dto.name, status: dto.status },
      { userId: user.sub, ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  @Patch(':id')
  @Permissions('setup:write')
  @ApiOperation({ summary: 'Update company (partial)' })
  @ApiResponse({ status: 200, description: 'Company updated' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  @ApiResponse({ status: 409, description: 'Code already exists' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<CompanyItem> {
    return this.companiesService.update(id, dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('setup:write')
  @ApiOperation({ summary: 'Soft-delete company' })
  @ApiResponse({ status: 204, description: 'Company deleted' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<void> {
    await this.companiesService.remove(id, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
