import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTankDto {
  @ApiProperty() @IsUUID() companyId!: string;
  @ApiProperty() @IsUUID() branchId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() productId?: string;
  @ApiProperty({ maxLength: 32 }) @IsString() @MaxLength(32) code!: string;
  @ApiProperty() @Type(() => Number) @IsNumber() capacity!: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() minLevel?: number;
  @ApiProperty() @Type(() => Number) @IsNumber() maxLevel!: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() currentLevel?: number;
  @ApiPropertyOptional({ maxLength: 64 }) @IsOptional() @IsString() @MaxLength(64) calibrationProfile?: string;
  @ApiPropertyOptional({ enum: ['active', 'inactive'] }) @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}
