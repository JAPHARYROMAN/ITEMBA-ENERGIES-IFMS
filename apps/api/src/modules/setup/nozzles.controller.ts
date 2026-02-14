import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
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
import { NozzlesService, type NozzleItem } from './nozzles.service';
import { CreateNozzleDto } from './dto/create-nozzle.dto';
import { UpdateNozzleDto } from './dto/update-nozzle.dto';

@ApiTags('setup')
@Controller('nozzles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class NozzlesController extends BaseListController {
  constructor(private readonly nozzlesService: NozzlesService) {
    super();
  }

  @Get()
  @Permissions('setup:read', 'reports:read')
  @ApiOperation({ summary: 'List nozzles' })
  @ApiResponse({ status: 200 })
  async list(@Query() query: ListQueryDto): Promise<ListResponse<NozzleItem>> {
    const params = getListParams(query);
    const { data, total } = await this.nozzlesService.findPage({
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
  @ApiOperation({ summary: 'Get nozzle by ID' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async getById(@Param('id') id: string): Promise<NozzleItem> {
    return this.nozzlesService.findById(id);
  }

  @Post()
  @Permissions('setup:write')
  @ApiOperation({ summary: 'Create nozzle' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 409 })
  async create(@Body() dto: CreateNozzleDto, @CurrentUser() user: JwtPayloadUser, @Req() req: Request): Promise<NozzleItem> {
    return this.nozzlesService.create(
      { stationId: dto.stationId, pumpId: dto.pumpId, tankId: dto.tankId, productId: dto.productId, code: dto.code, status: dto.status },
      { userId: user.sub, ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  @Patch(':id')
  @Permissions('setup:write')
  @ApiOperation({ summary: 'Update nozzle' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  @ApiResponse({ status: 409 })
  async update(@Param('id') id: string, @Body() dto: UpdateNozzleDto, @CurrentUser() user: JwtPayloadUser, @Req() req: Request): Promise<NozzleItem> {
    return this.nozzlesService.update(id, dto, { userId: user.sub, ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('setup:write')
  @ApiOperation({ summary: 'Soft-delete nozzle' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404 })
  async delete(@Param('id') id: string, @CurrentUser() user: JwtPayloadUser, @Req() req: Request): Promise<void> {
    await this.nozzlesService.remove(id, { userId: user.sub, ip: req.ip, userAgent: req.headers['user-agent'] });
  }
}
