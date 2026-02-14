import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser, type JwtPayloadUser } from '../auth/decorators/current-user.decorator';
import { GovernanceService } from './governance.service';
import {
  ActionReasonDto,
  CreateApprovalDto,
  CreatePolicyDto,
  ListApprovalsDto,
  ListPoliciesDto,
  UpdatePolicyDto,
} from './dto';

@ApiTags('governance')
@Controller('governance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class GovernanceController {
  constructor(private readonly governance: GovernanceService) {}

  @Get('policies')
  @Permissions('setup:write')
  @ApiOperation({ summary: 'List effective governance policies' })
  @ApiResponse({ status: 200 })
  listPolicies(@Query() query: ListPoliciesDto) {
    return this.governance.listPolicies(query);
  }

  @Post('policies')
  @Permissions('setup:write')
  @ApiOperation({ summary: 'Create governance policy (Manager)' })
  @ApiResponse({ status: 201 })
  createPolicy(
    @Body() dto: CreatePolicyDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ) {
    return this.governance.createPolicy(
      dto,
      { userId: user.sub, permissions: user.permissions },
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  @Patch('policies/:id')
  @Permissions('setup:write')
  @ApiOperation({ summary: 'Update governance policy (Manager)' })
  @ApiResponse({ status: 200 })
  updatePolicy(
    @Param('id') id: string,
    @Body() dto: UpdatePolicyDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ) {
    return this.governance.updatePolicy(
      id,
      dto,
      { userId: user.sub, permissions: user.permissions },
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  @Get('approvals')
  @Permissions('setup:read', 'reports:read', 'shifts:read', 'expenses:read', 'sales:read', 'deliveries:read', 'adjustments:read')
  @ApiOperation({ summary: 'List approvals (Manager all, Cashier own, Auditor read-only)' })
  @ApiResponse({ status: 200 })
  listApprovals(@Query() query: ListApprovalsDto, @CurrentUser() user: JwtPayloadUser) {
    return this.governance.listApprovals(query, { userId: user.sub, permissions: user.permissions });
  }

  @Get('approvals/:id')
  @Permissions('setup:read', 'reports:read', 'shifts:read', 'expenses:read', 'sales:read', 'deliveries:read', 'adjustments:read')
  @ApiOperation({ summary: 'Get approval request details with computed overdue fields' })
  @ApiResponse({ status: 200 })
  getRequest(@Param('id') id: string, @CurrentUser() user: JwtPayloadUser) {
    return this.governance.getApprovalByIdForActor(id, { userId: user.sub, permissions: user.permissions });
  }

  @Post('approvals')
  @Permissions('setup:write', 'shifts:close', 'expenses:write', 'sales:void', 'adjustments:write', 'deliveries:write')
  @ApiOperation({ summary: 'Create approval request (draft)' })
  @ApiResponse({ status: 201 })
  createApproval(
    @Body() dto: CreateApprovalDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ) {
    return this.governance.createApproval(
      dto,
      { userId: user.sub, permissions: user.permissions },
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  @Post('approvals/:id/submit')
  @Permissions('setup:write', 'shifts:close', 'expenses:write', 'sales:void', 'adjustments:write', 'deliveries:write')
  @ApiOperation({ summary: 'Submit approval request for workflow processing' })
  @ApiResponse({ status: 200 })
  submitApproval(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ) {
    return this.governance.submitApproval(
      id,
      { userId: user.sub, permissions: user.permissions },
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  @Post('approvals/:id/approve')
  @Permissions('shifts:approve', 'setup:write', 'expenses:write', 'sales:void', 'adjustments:write', 'deliveries:write')
  @ApiOperation({ summary: 'Approve current pending approval step' })
  @ApiResponse({ status: 200 })
  approve(
    @Param('id') id: string,
    @Body() dto: ActionReasonDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ) {
    return this.governance.approve(
      id,
      dto,
      { userId: user.sub, permissions: user.permissions },
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  @Post('approvals/:id/reject')
  @Permissions('shifts:approve', 'setup:write', 'expenses:write', 'sales:void', 'adjustments:write', 'deliveries:write')
  @ApiOperation({ summary: 'Reject current pending approval step' })
  @ApiResponse({ status: 200 })
  reject(
    @Param('id') id: string,
    @Body() dto: ActionReasonDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ) {
    return this.governance.reject(
      id,
      dto,
      { userId: user.sub, permissions: user.permissions },
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  @Post('approvals/:id/cancel')
  @Permissions('setup:write', 'shifts:close', 'expenses:write', 'sales:void', 'adjustments:write', 'deliveries:write')
  @ApiOperation({ summary: 'Cancel approval request' })
  @ApiResponse({ status: 200 })
  cancel(
    @Param('id') id: string,
    @Body() dto: ActionReasonDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ) {
    return this.governance.cancel(
      id,
      dto,
      { userId: user.sub, permissions: user.permissions },
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }
}
