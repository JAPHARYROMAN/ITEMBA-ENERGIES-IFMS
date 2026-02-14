import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateDeliveryDto {
  @ApiProperty()
  @IsUUID()
  branchId!: string;

  @ApiProperty({ example: 'DN-2024-001' })
  @IsString()
  @MaxLength(128)
  deliveryNote!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  vehicleNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  driverName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({ description: 'Ordered quantity' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  orderedQty!: number;

  @ApiProperty({ description: 'Expected delivery date (ISO)' })
  @IsDateString()
  expectedDate!: string;
}
