import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateSupplierInvoiceDto {
  @ApiProperty()
  @IsUUID()
  branchId!: string;

  @ApiProperty()
  @IsUUID()
  supplierId!: string;

  @ApiProperty({ example: 'INV-SUP-001' })
  @IsString()
  @MaxLength(64)
  invoiceNumber!: string;

  @ApiProperty()
  @IsDateString()
  invoiceDate!: string;

  @ApiProperty()
  @IsDateString()
  dueDate!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  totalAmount!: number;
}
