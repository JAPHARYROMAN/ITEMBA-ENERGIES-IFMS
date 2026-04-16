import { IsString, IsOptional, IsEnum, IsDateString, IsInt, IsUUID, Min, Max, IsBoolean, IsObject, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NotificationRecipientsDto {
  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  userIds?: string[];

  @ApiPropertyOptional({ enum: ['Manager', 'Cashier', 'Auditor'], isArray: true })
  @IsArray()
  @IsEnum(['Manager', 'Cashier', 'Auditor'], { each: true })
  @IsOptional()
  roles?: ('Manager' | 'Cashier' | 'Auditor')[];

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  branchMembership?: boolean;
}

export class CreateNotificationDto {
  @ApiProperty()
  @IsUUID()
  companyId!: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  stationId?: string;

  @ApiProperty()
  @IsString()
  type!: string;

  @ApiProperty({ enum: ['info', 'success', 'warning', 'critical'] })
  @IsEnum(['info', 'success', 'warning', 'critical'])
  severity!: 'info' | 'success' | 'warning' | 'critical';

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  body?: string;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  data?: Record<string, any>;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  actionUrl?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  dedupeKey?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @ApiProperty({ type: NotificationRecipientsDto })
  @ValidateNested()
  @Type(() => NotificationRecipientsDto)
  recipients!: NotificationRecipientsDto;
}

export class NotificationListQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'sent', 'failed'] })
  @IsEnum(['pending', 'sent', 'failed'])
  @IsOptional()
  status?: 'pending' | 'sent' | 'failed';

  @ApiPropertyOptional()
  @IsBoolean()
  @Type(() => Boolean)
  @IsOptional()
  unread?: boolean;

  @ApiPropertyOptional({ enum: ['info', 'success', 'warning', 'critical'] })
  @IsEnum(['info', 'success', 'warning', 'critical'])
  @IsOptional()
  severity?: 'info' | 'success' | 'warning' | 'critical';

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number = 25;
}

export class MarkSeenDto {
  @ApiProperty()
  @IsUUID()
  deliveryId!: string;
}

export class MarkReadDto {
  @ApiProperty()
  @IsUUID()
  deliveryId!: string;
}

export class ArchiveDto {
  @ApiProperty()
  @IsUUID()
  deliveryId!: string;
}

export class UpdatePreferencesDto {
  @ApiProperty()
  @IsObject()
  channelsJson!: {
    inapp: boolean;
    email: boolean;
    sms: boolean;
    push: boolean;
  };

  @ApiProperty({ enum: ['info', 'warning', 'critical'] })
  @IsEnum(['info', 'warning', 'critical'])
  severityMin!: 'info' | 'warning' | 'critical';

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  quietHoursJson?: {
    enabled: boolean;
    start: string; // HH:mm
    end: string;   // HH:mm
    timezone?: string;
  };

  @ApiProperty({ enum: ['none', 'daily', 'weekly'] })
  @IsEnum(['none', 'daily', 'weekly'])
  digestMode!: 'none' | 'daily' | 'weekly';
}

export class TestNotificationDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  title?: string = 'Test Notification';

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  body?: string = 'This is a test notification from IFMS';

  @ApiPropertyOptional({ enum: ['info', 'success', 'warning', 'critical'], default: 'info' })
  @IsEnum(['info', 'success', 'warning', 'critical'])
  @IsOptional()
  severity?: 'info' | 'success' | 'warning' | 'critical' = 'info';

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  userId?: string; // If not provided, send to current user

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  branchId?: string; // Send to all users in branch
}
