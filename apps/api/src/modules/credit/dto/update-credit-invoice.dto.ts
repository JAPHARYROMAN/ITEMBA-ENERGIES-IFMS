import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';
import { CreditInvoiceItemDto } from './create-credit-invoice.dto';

export class UpdateCreditInvoiceDto {
  @ApiPropertyOptional({ description: 'New due date (ISO)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Revised total amount' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  totalAmount?: number;

  @ApiPropertyOptional({ description: 'Replace invoice line items', type: [CreditInvoiceItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreditInvoiceItemDto)
  items?: CreditInvoiceItemDto[];
}
