import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { VARIANCE_CLASSIFICATIONS } from '../../../database/schema/inventory/variances';

export class CreateReconciliationDto {
  @ApiProperty()
  @IsUUID()
  branchId!: string;

  @ApiProperty({ description: 'Reconciliation date (ISO)' })
  @IsDateString({}, { message: 'reconciliationDate must be a valid ISO 8601 date string' })
  reconciliationDate!: string;

  @ApiProperty({ description: 'Physical/actual volume (e.g. from dip sum or manual)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualVolume!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: VARIANCE_CLASSIFICATIONS, description: 'Classification when variance is recorded' })
  @IsOptional()
  @IsIn([...VARIANCE_CLASSIFICATIONS])
  varianceClassification?: string;
}
