import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateNozzleDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() stationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() pumpId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() tankId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() productId?: string;
  @ApiPropertyOptional({ maxLength: 32 }) @IsOptional() @IsString() @MaxLength(32) code?: string;
  @ApiPropertyOptional({ enum: ['active', 'inactive'] }) @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}
