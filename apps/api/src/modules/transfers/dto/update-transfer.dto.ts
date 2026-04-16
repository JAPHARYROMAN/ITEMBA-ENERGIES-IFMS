import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTransferDto {
  @ApiPropertyOptional({ description: 'Reference note for this transfer' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  reference?: string;
}
