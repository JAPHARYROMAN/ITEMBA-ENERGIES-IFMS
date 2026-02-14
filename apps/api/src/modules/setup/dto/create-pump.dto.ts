import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreatePumpDto {
  @ApiProperty() @IsUUID() stationId!: string;
  @ApiProperty({ maxLength: 32 }) @IsString() @MaxLength(32) code!: string;
  @ApiPropertyOptional({ maxLength: 128 }) @IsOptional() @IsString() @MaxLength(128) name?: string;
  @ApiPropertyOptional({ enum: ['active', 'inactive'] }) @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}
