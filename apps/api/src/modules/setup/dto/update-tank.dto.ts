import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateTankDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() companyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() productId?: string;
  @ApiPropertyOptional({ maxLength: 32 }) @IsOptional() @IsString() @MaxLength(32) code?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() capacity?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() minLevel?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() maxLevel?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() currentLevel?: number;
  @ApiPropertyOptional({ maxLength: 64 }) @IsOptional() @IsString() @MaxLength(64) calibrationProfile?: string;
  @ApiPropertyOptional({ enum: ['active', 'inactive'] }) @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}
