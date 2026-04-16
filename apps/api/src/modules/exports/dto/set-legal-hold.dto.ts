import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetLegalHoldDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({ example: 'Regulatory investigation active' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}
