import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsString()
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @ApiProperty()
  @IsString()
  @MaxLength(10000)
  content: string;

  @ApiPropertyOptional()
  @IsOptional()
  cards?: ResponseCardDto[];
}

export class ResponseCardDto {
  @ApiProperty({ enum: ['table', 'data', 'alert', 'download', 'confirmation', 'forecast'] })
  @IsString()
  type: 'table' | 'data' | 'alert' | 'download' | 'confirmation' | 'forecast';

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  content: unknown;
}

export class ChatRequestDto {
  @ApiProperty({ description: 'User message', maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({ type: [ChatMessageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];

  @ApiPropertyOptional({ description: 'Current page path for context' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  pageContext?: string;
}

// ---------------------------------------------------------------------------
// Confirmation flow DTOs
// ---------------------------------------------------------------------------

export type ConfirmAction = 'create_delivery' | 'create_expense' | 'record_payment' | 'void_sale';

export class ConfirmWriteDto {
  @ApiProperty({ enum: ['create_delivery', 'create_expense', 'record_payment'] })
  @IsString()
  @IsIn(['create_delivery', 'create_expense', 'record_payment', 'void_sale'])
  action: ConfirmAction;

  @ApiProperty({ description: 'Payload fields for the write operation' })
  @IsObject()
  payload: Record<string, unknown>;
}
