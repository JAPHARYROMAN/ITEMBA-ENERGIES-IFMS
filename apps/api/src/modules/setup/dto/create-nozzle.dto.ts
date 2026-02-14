import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateNozzleDto {
  @ApiProperty() @IsUUID() stationId!: string;
  @ApiProperty() @IsUUID() pumpId!: string;
  @ApiProperty() @IsUUID() tankId!: string;
  @ApiProperty() @IsUUID() productId!: string;
  @ApiProperty({ maxLength: 32 }) @IsString() @MaxLength(32) code!: string;
  @ApiPropertyOptional({ enum: ['active', 'inactive'] }) @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}
