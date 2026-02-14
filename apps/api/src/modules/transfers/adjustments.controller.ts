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
import {
  AdjustmentsService,
  type AdjustmentItem,
  type AdjustmentsListParams,
} from './adjustments.service';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';

@ApiTags('adjustments')
@Controller('adjustments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class AdjustmentsController extends BaseListController {
  constructor(private readonly adjustmentsService: AdjustmentsService) {
    super();
  }

  @Post()
  @Permissions('adjustments:write')
  @ApiOperation({ summary: 'Create stock adjustment (Manager permission + reason required)' })
  @ApiResponse({ status: 201, description: 'Adjustment created' })
  @ApiResponse({ status: 400, description: 'Tank/branch mismatch or result out of range' })
  @ApiResponse({ status: 404, description: 'Branch or tank not found' })
  async create(
    @Body() dto: CreateAdjustmentDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<AdjustmentItem> {
    return this.adjustmentsService.create(dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get()
  @Permissions('adjustments:read')
  @ApiOperation({ summary: 'List adjustments' })
  @ApiResponse({ status: 200 })
  async list(
    @Query() query: ListQueryDto & AdjustmentsListParams,
  ): Promise<ListResponse<AdjustmentItem>> {
    const params = getListParams(query);
    const { data, total } = await this.adjustmentsService.findPage({
      page: query.page,
      pageSize: query.pageSize,
      branchId: query.branchId,
      companyId: query.companyId,
      tankId: query.tankId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    return this.listResponse(data, total, { page: params.page, pageSize: params.pageSize });
  }
}
