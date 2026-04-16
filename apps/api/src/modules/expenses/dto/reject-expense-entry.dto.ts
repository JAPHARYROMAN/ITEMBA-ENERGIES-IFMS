import { ApiProperty } from '@nestjs/swagger';
import { SanitizeHtml } from '../../../common/decorators/sanitize.decorator';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectExpenseEntryDto {
  @ApiProperty({ maxLength: 512 })
  @SanitizeHtml()
  @IsString()
  @MinLength(3)
  @MaxLength(512)
  reason!: string;
}
