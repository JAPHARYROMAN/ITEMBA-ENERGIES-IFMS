import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

export class CreditInvoiceItemDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tax?: number;
}

export class CreateCreditInvoiceDto {
  @ApiProperty()
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional({ description: 'Invoice date (ISO); defaults to today' })
  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @ApiPropertyOptional({ description: 'Due date (ISO); defaults from customer terms' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty({ type: [CreditInvoiceItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreditInvoiceItemDto)
  items!: CreditInvoiceItemDto[];
}
