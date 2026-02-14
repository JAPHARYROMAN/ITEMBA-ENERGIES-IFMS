import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { ReportsRefreshService, type RefreshResult } from '../reports/reports-refresh.service';
import { ReportsRefreshDto } from './dto/reports-refresh.dto';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class AdminController {
  constructor(private readonly reportsRefresh: ReportsRefreshService) {}

  @Post('reports/refresh')
  @Permissions('reports:refresh')
  @ApiOperation({ summary: 'Manually refresh report materialized views (Manager only)' })
  @ApiResponse({ status: 200, description: 'Refresh completed' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async refreshReports(@Body() dto: ReportsRefreshDto): Promise<RefreshResult> {
    return this.reportsRefresh.refreshAll({
      dateFrom: dto.dateFrom,
      dateTo: dto.dateTo,
    });
  }
}
