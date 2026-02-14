import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class SubmitApprovalRequestDto {
  @ApiProperty()
  @IsUUID()
  companyId!: string;

  @ApiProperty()
  @IsUUID()
  branchId!: string;

  @ApiProperty({ example: 'expense_entry' })
  @IsString()
  @MaxLength(64)
  entityType!: string;

  @ApiProperty()
  @IsUUID()
  entityId!: string;

  @ApiProperty({ example: 'approve' })
  @IsString()
  @MaxLength(64)
  actionType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ description: 'Percentage value as ratio, e.g. 0.1 for 10%' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  percentage?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  reason?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  meta?: Record<string, unknown>;
}
