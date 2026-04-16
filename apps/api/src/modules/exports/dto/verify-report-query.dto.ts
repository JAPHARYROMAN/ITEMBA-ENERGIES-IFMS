import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class VerifyReportQueryDto {
  @ApiProperty({ example: '9a8f7d...', required: false })
  @IsOptional()
  @IsString()
  @MinLength(16)
  token?: string;
}
