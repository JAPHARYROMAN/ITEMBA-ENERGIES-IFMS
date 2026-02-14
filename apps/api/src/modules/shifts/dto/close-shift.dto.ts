import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

export class ClosingMeterReadingDto {
  @ApiProperty()
  @IsUUID()
  nozzleId!: string;

  @ApiProperty({ description: 'Closing meter value (must be >= opening reading)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value!: number;
}

export class ShiftCollectionDto {
  @ApiProperty({ example: 'Cash', description: 'Payment method' })
  @IsString()
  @MaxLength(32)
  paymentMethod!: string;

  @ApiProperty({ description: 'Amount collected' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;
}

export class CloseShiftDto {
  @ApiProperty({ type: [ClosingMeterReadingDto], description: 'Closing meter readings per nozzle' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClosingMeterReadingDto)
  closingMeterReadings!: ClosingMeterReadingDto[];

  @ApiProperty({ type: [ShiftCollectionDto], description: 'Collections by payment method' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShiftCollectionDto)
  collections!: ShiftCollectionDto[];

  @ApiPropertyOptional({ description: 'Required when variance is non-zero or beyond threshold' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  varianceReason?: string;
}
