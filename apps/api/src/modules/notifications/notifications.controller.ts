import {
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Param,
  Body,
  UseGuards,
  ForbiddenException,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../auth/decorators/current-user.decorator';
import { NotificationService } from './notifications.service';
import { OutboxWorker } from './outbox.worker';
import { NotificationMetricsService } from './notification-metrics.service';
import {
  CreateNotificationDto,
  NotificationListQueryDto,
  MarkSeenDto,
  MarkReadDto,
  ArchiveDto,
  UpdatePreferencesDto,
  TestNotificationDto,
} from './dto';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly outboxWorker: OutboxWorker,
    private readonly metricsService: NotificationMetricsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for current user' })
  @ApiResponse({
    status: 200,
    description: 'Notifications retrieved successfully',
  })
  async listNotifications(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: NotificationListQueryDto,
  ) {
    const userId = user.sub;
    const { page = 1, pageSize = 25, ...filters } = query;

    // Convert date strings to Date objects
    const filterParams = {
      ...filters,
      dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
      dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
    };

    const result = await this.notificationService.listUserDeliveries(userId, {
      ...filterParams,
      page,
      pageSize,
    });

    return {
      data: result.deliveries,
      pagination: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count for current user' })
  @ApiResponse({
    status: 200,
    description: 'Unread count retrieved successfully',
  })
  async getUnreadCount(@CurrentUser() user: JwtPayloadUser) {
    const userId = user.sub;
    const count = await this.notificationService.getUnreadCount(userId);
    return { count };
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get notification preferences for current user' })
  @ApiResponse({
    status: 200,
    description: 'Preferences retrieved successfully',
  })
  async getPreferences(@CurrentUser() user: JwtPayloadUser) {
    const userId = user.sub;
    const preferences = await this.notificationService.getUserPreferences(userId);
    return preferences;
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update notification preferences for current user' })
  @ApiResponse({ status: 200, description: 'Preferences updated successfully' })
  async updatePreferences(
    @CurrentUser() user: JwtPayloadUser,
    @Body() updateDto: UpdatePreferencesDto,
  ) {
    const userId = user.sub;
    await this.notificationService.updateUserPreferences(userId, updateDto);
    return { message: 'Preferences updated successfully' };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get notification delivery by ID' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Notification delivery not found' })
  async getById(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationService.getDeliveryById(user.sub, id);
  }

  @Post(':deliveryId/seen')
  @ApiOperation({ summary: 'Mark notification as seen' })
  @ApiResponse({ status: 200, description: 'Notification marked as seen' })
  async markSeen(@CurrentUser() user: JwtPayloadUser, @Param('deliveryId', ParseUUIDPipe) deliveryId: string) {
    const userId = user.sub;
    await this.notificationService.markSeen(deliveryId, userId);
    return { message: 'Notification marked as seen' };
  }

  @Post(':deliveryId/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  async markRead(@CurrentUser() user: JwtPayloadUser, @Param('deliveryId', ParseUUIDPipe) deliveryId: string) {
    const userId = user.sub;
    await this.notificationService.markRead(deliveryId, userId);
    return { message: 'Notification marked as read' };
  }

  @Post(':deliveryId/archive')
  @ApiOperation({ summary: 'Archive notification' })
  @ApiResponse({ status: 200, description: 'Notification archived' })
  async archive(@CurrentUser() user: JwtPayloadUser, @Param('deliveryId', ParseUUIDPipe) deliveryId: string) {
    const userId = user.sub;
    await this.notificationService.archive(deliveryId, userId);
    return { message: 'Notification archived' };
  }
}

@ApiTags('admin-notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly outboxWorker: OutboxWorker,
    private readonly metricsService: NotificationMetricsService,
  ) {}

  @Post('create')
  @ApiOperation({ summary: 'Create a new notification (Admin only)' })
  @ApiResponse({
    status: 201,
    description: 'Notification created successfully',
  })
  async createNotification(
    @Body() createDto: CreateNotificationDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    if (!user.permissions.includes('notifications:admin')) {
      throw new ForbiddenException('Admin permissions required');
    }

    const notificationId = await this.notificationService.createNotification({
      scope: {
        companyId: createDto.companyId,
        branchId: createDto.branchId,
        stationId: createDto.stationId,
      },
      type: createDto.type,
      severity: createDto.severity,
      title: createDto.title,
      body: createDto.body,
      data: createDto.data,
      actionUrl: createDto.actionUrl,
      dedupeKey: createDto.dedupeKey,
      expiresAt: createDto.expiresAt ? new Date(createDto.expiresAt) : undefined,
      recipients: createDto.recipients,
    });

    return { notificationId, message: 'Notification created successfully' };
  }

  @Post('test')
  @ApiOperation({ summary: 'Send test notification (Manager only)' })
  @ApiResponse({ status: 201, description: 'Test notification sent' })
  async sendTestNotification(
    @Body() testDto: TestNotificationDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    if (!user.permissions.includes('notifications:test')) {
      throw new ForbiddenException('Manager permissions required');
    }

    const userId = user.sub;
    const userBranchId = user.permissions
      .find((p) => p.startsWith('branch:'))
      ?.replace('branch:', '');
    const userCompanyId = user.permissions
      .find((p) => p.startsWith('company:'))
      ?.replace('company:', '');

    let recipients: { userIds?: string[]; branchMembership?: boolean } = {
      userIds: [userId],
    };

    if (testDto.userId) {
      recipients = { userIds: [testDto.userId] };
    } else if (testDto.branchId) {
      recipients = { branchMembership: true };
    }

    if (!userCompanyId) {
      throw new BadRequestException('No company scope found for current user');
    }

    const notificationId = await this.notificationService.createNotification({
      scope: {
        companyId: userCompanyId,
        branchId: testDto.branchId || userBranchId,
      },
      type: 'system',
      severity: testDto.severity || 'info',
      title: testDto.title || 'Test Notification',
      body: testDto.body || 'This is a test notification from IFMS',
      recipients,
    });

    return { notificationId, message: 'Test notification sent successfully' };
  }

  @Post('outbox/process')
  @ApiOperation({ summary: 'Manually trigger outbox processing (Admin only)' })
  @ApiResponse({ status: 200, description: 'Outbox processing triggered' })
  async processOutbox(@CurrentUser() user: JwtPayloadUser) {
    if (!user.permissions.includes('notifications:admin')) {
      throw new ForbiddenException('Admin permissions required');
    }

    const result = await this.outboxWorker.processJobsOnce();
    return {
      message: 'Outbox processing completed',
      ...result,
    };
  }

  @Get('admin/health')
  @ApiOperation({
    summary: 'Get notification system health metrics (Manager only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Health metrics retrieved successfully',
  })
  async getHealth(@CurrentUser() user: JwtPayloadUser) {
    if (!user.permissions.includes('notifications:admin')) {
      throw new ForbiddenException('Admin permissions required');
    }

    // Get outbox backlog
    const outboxBacklog = await this.getOutboxBacklog();
    const deliveryStats = await this.getDeliveryStats();

    return {
      timestamp: new Date().toISOString(),
      status: outboxBacklog.total > 1000 ? 'warning' : 'healthy',
      outbox: {
        total_pending: outboxBacklog.total,
        oldest_job_age_seconds: outboxBacklog.oldestAge,
        failed_jobs: outboxBacklog.failed,
      },
      deliveries: deliveryStats,
      metrics: this.metricsService.getCurrentMetrics(),
    };
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get Prometheus metrics' })
  @ApiResponse({
    status: 200,
    description: 'Prometheus metrics returned',
    content: { 'text/plain': { schema: { type: 'string' } } },
  })
  getPrometheusMetrics(): string {
    return this.metricsService.getPrometheusMetrics();
  }

  private async getOutboxBacklog() {
    return await this.notificationService.getOutboxBacklog();
  }

  private async getDeliveryStats() {
    return await this.notificationService.getDeliveryStats();
  }
}
