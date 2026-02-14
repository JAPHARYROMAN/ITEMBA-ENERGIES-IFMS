import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class TankToTankTransferDto {
  @ApiProperty()
  @IsUUID()
  fromTankId!: string;

  @ApiProperty()
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
