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
import { BranchesService, type BranchItem } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@ApiTags('core')
@Controller('branches')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class BranchesController extends BaseListController {
  constructor(private readonly branchesService: BranchesService) {
    super();
  }

  @Get()
  @Permissions('setup:read', 'reports:read')
  @ApiOperation({ summary: 'List branches' })
  @ApiResponse({ status: 200 })
  async list(@Query() query: ListQueryDto): Promise<ListResponse<BranchItem>> {
    const params = getListParams(query);
    const { data, total } = await this.branchesService.findPage({
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      q: query.q,
      stationId: query.stationId,
    });
    return this.listResponse(data, total, { page: params.page, pageSize: params.pageSize });
  }

  @Get(':id')
  @Permissions('setup:read', 'reports:read')
  @ApiOperation({ summary: 'Get branch by ID' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async getById(@Param('id') id: string): Promise<BranchItem> {
    return this.branchesService.findById(id);
  }

  @Post()
  @Permissions('setup:write')
  @ApiOperation({ summary: 'Create branch' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 409 })
  async create(
    @Body() dto: CreateBranchDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<BranchItem> {
    return this.branchesService.create(
      { stationId: dto.stationId, code: dto.code, name: dto.name, status: dto.status },
      { userId: user.sub, ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  @Patch(':id')
  @Permissions('setup:write')
  @ApiOperation({ summary: 'Update branch' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  @ApiResponse({ status: 409 })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<BranchItem> {
    return this.branchesService.update(id, dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('setup:write')
  @ApiOperation({ summary: 'Soft-delete branch' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404 })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<void> {
    await this.branchesService.remove(id, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
