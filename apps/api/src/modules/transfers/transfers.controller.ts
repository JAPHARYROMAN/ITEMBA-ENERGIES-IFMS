import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
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
import { TransfersService, type TransferItem } from './transfers.service';
import { TransfersListQueryDto } from './dto/transfers-list-query.dto';
import { TankToTankTransferDto } from './dto/tank-to-tank-transfer.dto';
import { StationToStationTransferDto } from './dto/station-to-station-transfer.dto';
import { UpdateTransferDto } from './dto/update-transfer.dto';

@ApiTags('transfers')
@Controller('transfers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class TransfersController extends BaseListController {
  constructor(private readonly transfersService: TransfersService) {
    super();
  }

  @Post('tank-to-tank')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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
    @Query() query: TransfersListQueryDto,
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

  @Get(':id')
  @Permissions('transfers:read')
  @ApiOperation({ summary: 'Get transfer by ID' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Transfer not found' })
  async getById(@Param('id', ParseUUIDPipe) id: string): Promise<TransferItem> {
    return this.transfersService.findById(id);
  }

  @Patch(':id')
  @Permissions('transfers:write')
  @ApiOperation({ summary: 'Update transfer metadata (reference note)' })
  @ApiResponse({ status: 200, description: 'Transfer updated' })
  @ApiResponse({ status: 400, description: 'Cannot update voided transfer' })
  @ApiResponse({ status: 404, description: 'Transfer not found' })
  async updateTransfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransferDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<TransferItem> {
    return this.transfersService.updateTransfer(id, dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Delete(':id')
  @Permissions('transfers:write')
  @ApiOperation({ summary: 'Delete (void) a transfer and reverse stock movements' })
  @ApiResponse({ status: 200, description: 'Transfer voided' })
  @ApiResponse({ status: 400, description: 'Insufficient stock to reverse' })
  async deleteTransfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @CurrentUser() user: JwtPayloadUser,
  ): Promise<{ success: boolean }> {
    return this.transfersService.deleteTransfer(id, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
