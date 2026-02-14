import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PayablesAgingService, type PayablesAgingReport } from './payables-aging.service';

@ApiTags('payables')
@Controller('payables')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class PayablesController {
  constructor(private readonly agingService: PayablesAgingService) {}

  @Get('aging')
  @Permissions('payables:read')
  @ApiOperation({ summary: 'Payables aging (buckets: current, 1-30, 31-60, 61-90, 90+ days overdue)' })
  @ApiResponse({ status: 200 })
  async getAging(
    @Query('branchId') branchId?: string,
    @Query('companyId') companyId?: string,
    @Query('asOf') asOf?: string,
  ): Promise<PayablesAgingReport> {
    return this.agingService.getAging({ branchId, companyId, asOf });
  }
}
