import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAdjustmentDto {
  @ApiProperty()
  @IsUUID()
  branchId!: string;

  @ApiProperty()
  @IsUUID()
  tankId!: string;

  @ApiProperty({ description: 'Volume change (positive = add, negative = reduce)' })
  @Type(() => Number)
  @IsNumber()
  volumeDelta!: number;

  @ApiProperty({ description: 'Reason code or short reason (required)' })
  @IsString()
  @MaxLength(64)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Adjustment date (ISO); defaults to now' })
  @IsOptional()
  @IsDateString()
  adjustmentDate?: string;
}
