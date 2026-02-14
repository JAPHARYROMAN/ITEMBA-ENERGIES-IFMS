import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

export class OpeningMeterReadingDto {
  @ApiProperty({ description: 'Nozzle ID' })
  @IsUUID()
  nozzleId!: string;

  @ApiProperty({ description: 'Opening meter value (e.g. liters)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value!: number;

  @ApiPropertyOptional({ description: 'Price per unit at open (for expected sales computation)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pricePerUnit?: number;
}

export class OpenShiftDto {
  @ApiProperty({ description: 'Branch where the shift is opened' })
  @IsUUID()
  branchId!: string;

  @ApiProperty({ type: [OpeningMeterReadingDto], description: 'Opening meter readings per nozzle' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningMeterReadingDto)
  openingMeterReadings!: OpeningMeterReadingDto[];
}
