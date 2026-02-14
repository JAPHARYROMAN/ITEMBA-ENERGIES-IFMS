import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateDipDto {
  @ApiProperty()
  @IsUUID()
  branchId!: string;

  @ApiProperty()
  @IsUUID()
  tankId!: string;

  @ApiProperty({ description: 'Dip date (ISO)' })
  @IsDateString()
  dipDate!: string;

  @ApiProperty({ description: 'Volume (e.g. liters)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  volume!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  waterLevel?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  temperature?: number;
}
