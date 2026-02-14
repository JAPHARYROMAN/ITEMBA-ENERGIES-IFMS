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
import { TransfersService, type TransferItem, type TransfersListParams } from './transfers.service';
import { TankToTankTransferDto } from './dto/tank-to-tank-transfer.dto';
import { StationToStationTransferDto } from './dto/station-to-station-transfer.dto';

@ApiTags('transfers')
@Controller('transfers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class TransfersController extends BaseListController {
  constructor(private readonly transfersService: TransfersService) {
    super();
  }

  @Post('tank-to-tank')
  @Permissions('transfers:write')
  @ApiOperation({ summary: 'Transfer stock between tanks (same branch)' })
  @ApiResponse({ status: 201, description: 'Transfer completed' })
  @ApiResponse({ status: 400, description: 'Same branch required / insufficient stock or capacity' })
  @ApiResponse({ status: 404, description: 'Tank not found' })
  async tankToTank(
    @Body() dto: TankToTankTransferDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<TransferItem> {
    return this.transfersService.tankToTank(dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('station-to-station')
  @Permissions('transfers:write')
  @ApiOperation({ summary: 'Transfer stock between stations (different branches)' })
  @ApiResponse({ status: 201, description: 'Transfer completed' })
  @ApiResponse({ status: 400, description: 'Different branches required / insufficient stock or capacity' })
  @ApiResponse({ status: 404, description: 'Tank not found' })
  async stationToStation(
    @Body() dto: StationToStationTransferDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<TransferItem> {
    return this.transfersService.stationToStation(dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get()
  @Permissions('transfers:read')
  @ApiOperation({ summary: 'List transfers' })
  @ApiResponse({ status: 200 })
  async list(
    @Query() query: ListQueryDto & TransfersListParams,
  ): Promise<ListResponse<TransferItem>> {
    const params = getListParams(query);
    const { data, total } = await this.transfersService.findPage({
      page: query.page,
      pageSize: query.pageSize,
      branchId: query.branchId,
      companyId: query.companyId,
      transferType: query.transferType,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    return this.listResponse(data, total, { page: params.page, pageSize: params.pageSize });
  }
}
