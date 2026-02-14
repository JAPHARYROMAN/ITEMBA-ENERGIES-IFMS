import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CreditAgingService, type AgingReport } from './credit-aging.service';

@ApiTags('credit')
@Controller('credit')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class CreditController {
  constructor(private readonly agingService: CreditAgingService) {}

  @Get('aging')
  @Permissions('credit:read')
  @ApiOperation({ summary: 'Aging report (buckets: current, 1-30, 31-60, 61-90, 90+ days overdue)' })
  @ApiResponse({ status: 200 })
  async getAging(
    @Query('branchId') branchId?: string,
    @Query('companyId') companyId?: string,
    @Query('asOf') asOf?: string,
  ): Promise<AgingReport> {
    return this.agingService.getAging({ branchId, companyId, asOf });
  }
}
