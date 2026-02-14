import {
  Body,
  Controller,
  Get,
  Param,
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
import {
  DeliveriesService,
  type DeliveryItem,
  type DeliveryDetail,
  type DeliveriesListParams,
} from './deliveries.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { ReceiveGrnDto } from './dto/receive-grn.dto';

@ApiTags('deliveries')
@Controller('deliveries')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class DeliveriesController extends BaseListController {
  constructor(private readonly deliveriesService: DeliveriesService) {
    super();
  }

  @Post()
  @Permissions('deliveries:write')
  @ApiOperation({ summary: 'Create expected delivery' })
  @ApiResponse({ status: 201, description: 'Delivery created' })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async create(
    @Body() dto: CreateDeliveryDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<DeliveryItem> {
    return this.deliveriesService.create(dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':id/grn')
  @Permissions('deliveries:write')
  @ApiOperation({ summary: 'Receive delivery (GRN)' })
  @ApiResponse({ status: 200, description: 'Delivery received' })
  @ApiResponse({ status: 400, description: 'Allocations must sum to received qty / tank capacity / variance reason required' })
  @ApiResponse({ status: 404, description: 'Delivery or tank not found' })
  async receiveGrn(
    @Param('id') id: string,
    @Body() dto: ReceiveGrnDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<DeliveryDetail> {
    return this.deliveriesService.receiveGrn(id, dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get()
  @Permissions('deliveries:read')
  @ApiOperation({ summary: 'List deliveries' })
  @ApiResponse({ status: 200 })
  async list(
    @Query() query: ListQueryDto & DeliveriesListParams,
  ): Promise<ListResponse<DeliveryItem>> {
    const params = getListParams(query);
    const { data, total } = await this.deliveriesService.findPage({
      page: query.page,
      pageSize: query.pageSize,
      branchId: query.branchId,
      companyId: query.companyId,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    return this.listResponse(data, total, { page: params.page, pageSize: params.pageSize });
  }

  @Get(':id')
  @Permissions('deliveries:read')
  @ApiOperation({ summary: 'Get delivery details' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Delivery not found' })
  async getById(@Param('id') id: string): Promise<DeliveryDetail> {
    return this.deliveriesService.findById(id);
  }
}
