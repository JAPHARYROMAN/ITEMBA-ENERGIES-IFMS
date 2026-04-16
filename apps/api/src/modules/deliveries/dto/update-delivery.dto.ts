import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class UpdateDeliveryDto {
  @ApiPropertyOptional({ example: 'DN-2024-001-AMENDED' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deliveryNote?: string;

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

  @ApiPropertyOptional({ description: 'Ordered quantity' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  orderedQty?: number;

  @ApiPropertyOptional({ description: 'Expected delivery date (ISO)' })
  @IsOptional()
  @IsDateString()
  expectedDate?: string;
}
