import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectExpenseEntryDto {
  @ApiProperty({ maxLength: 512 })
  @IsString()
  @MinLength(3)
  @MaxLength(512)
  reason!: string;
}
