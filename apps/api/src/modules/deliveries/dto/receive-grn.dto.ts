import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

export class GrnAllocationDto {
  @ApiProperty()
  @IsUUID()
  tankId!: string;

  @ApiProperty({ description: 'Quantity to allocate to this tank' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;
}

export class ReceiveGrnDto {
  @ApiProperty({ description: 'Received quantity (allocations must sum exactly to this)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  receivedQty!: number;

  @ApiPropertyOptional({ description: 'Density at receipt' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  density?: number;

  @ApiPropertyOptional({ description: 'Temperature at receipt' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  temperature?: number;

  @ApiProperty({ type: [GrnAllocationDto], description: 'Allocations per tank; must sum exactly to receivedQty' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GrnAllocationDto)
  allocations!: GrnAllocationDto[];

  @ApiPropertyOptional({ description: 'Required when variance (ordered - received) exceeds threshold' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  varianceReason?: string;
}
