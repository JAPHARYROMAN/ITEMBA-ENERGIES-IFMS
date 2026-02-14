import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class StationToStationTransferDto {
  @ApiProperty({ description: 'Source tank (at source station/branch)' })
  @IsUUID()
  fromTankId!: string;

  @ApiProperty({ description: 'Destination tank (at destination station/branch)' })
  @IsUUID()
  toTankId!: string;

  @ApiProperty({ description: 'Quantity to transfer (L)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @ApiPropertyOptional({ description: 'Transfer date (ISO); defaults to now' })
  @IsOptional()
  @IsDateString()
  transferDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  reference?: string;
}
