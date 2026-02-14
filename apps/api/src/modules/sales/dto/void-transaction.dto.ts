import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class VoidTransactionDto {
  @ApiProperty({ description: 'Reason for void (required)' })
  @IsString()
  @MinLength(1, { message: 'Void reason is required' })
  @MaxLength(512)
  reason!: string;
}
