import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { EXPORT_TYPES, type ExportType } from '../exports.types';

export class ExportClientContextDto {
  @ApiProperty({ required: false, example: '/app/reports/overview' })
  @IsOptional()
  @IsString()
  requestedFromUrl?: string;

  @ApiProperty({ required: false, example: 'Africa/Dar_es_Salaam' })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class CreateExportDto {
  @ApiProperty({ enum: ['pdf', 'csv'] })
  @IsIn(['pdf', 'csv'])
  format!: 'pdf' | 'csv';

  @ApiProperty({ enum: EXPORT_TYPES })
  @IsIn(EXPORT_TYPES)
  exportType!: ExportType;

  @ApiProperty({ type: Object, required: false })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @ApiProperty({ type: ExportClientContextDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExportClientContextDto)
  clientContext?: ExportClientContextDto;
}
