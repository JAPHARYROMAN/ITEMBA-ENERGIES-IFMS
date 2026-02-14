import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdatePumpDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() stationId?: string;
  @ApiPropertyOptional({ maxLength: 32 }) @IsOptional() @IsString() @MaxLength(32) code?: string;
  @ApiPropertyOptional({ maxLength: 128 }) @IsOptional() @IsString() @MaxLength(128) name?: string;
  @ApiPropertyOptional({ enum: ['active', 'inactive'] }) @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}
