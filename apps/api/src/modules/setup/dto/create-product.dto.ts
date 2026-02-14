import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @ApiProperty()
  @IsUUID()
  companyId!: string;

  @ApiProperty({ maxLength: 32 })
  @IsString()
  @MaxLength(32)
  code!: string;

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ maxLength: 64 })
  @IsString()
  @MaxLength(64)
  category!: string;

  @ApiProperty({ example: 1.45 })
  @Type(() => Number)
  @IsNumber()
  pricePerUnit!: number;

  @ApiPropertyOptional({ default: 'L', maxLength: 16 })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  unit?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;
}
