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
import { ShiftsService, type ShiftItem } from './shifts.service';
import { OpenShiftDto } from './dto/open-shift.dto';
import { CloseShiftDto } from './dto/close-shift.dto';

@ApiTags('shifts')
@Controller('shifts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class ShiftsController extends BaseListController {
  constructor(private readonly shiftsService: ShiftsService) {
    super();
  }

  @Post('open')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Permissions('shifts:open')
  @ApiOperation({ summary: 'Open a new shift' })
  @ApiResponse({ status: 201, description: 'Shift opened' })
  @ApiResponse({ status: 409, description: 'Branch already has an open shift' })
  async open(
    @Body() dto: OpenShiftDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<ShiftItem> {
    return this.shiftsService.open(dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':id/close')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Permissions('shifts:close')
  @ApiOperation({ summary: 'Close a shift' })
  @ApiResponse({ status: 200, description: 'Shift closed' })
  @ApiResponse({ status: 400, description: 'Closing reading < opening or variance reason required' })
  async close(
    @Param('id') id: string,
    @Body() dto: CloseShiftDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<ShiftItem> {
    return this.shiftsService.close(id, dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get()
  @Permissions('shifts:read')
  @ApiOperation({ summary: 'List shifts' })
  @ApiResponse({ status: 200 })
  async list(
    @Query() query: ListQueryDto & { status?: string },
  ): Promise<ListResponse<ShiftItem>> {
    const params = getListParams(query);
    const { data, total } = await this.shiftsService.findPage({
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      branchId: query.branchId,
      stationId: query.stationId,
      companyId: query.companyId,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    return this.listResponse(data, total, { page: params.page, pageSize: params.pageSize });
  }

  @Get(':id')
  @Permissions('shifts:read')
  @ApiOperation({ summary: 'Get shift by ID' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async getById(@Param('id') id: string): Promise<ShiftItem> {
    return this.shiftsService.findById(id);
  }

  @Post(':id/submit-for-approval')
  @Permissions('shifts:close')
  @ApiOperation({ summary: 'Submit closed shift for approval (optional workflow)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'Shift not closed or already submitted' })
  async submitForApproval(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<ShiftItem> {
    return this.shiftsService.submitForApproval(id, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':id/approve')
  @Permissions('shifts:approve')
  @ApiOperation({ summary: 'Approve shift (Manager only)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'Shift not pending approval' })
  async approve(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<ShiftItem> {
    return this.shiftsService.approve(id, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
