import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

export class PaymentAllocationDto {
  @ApiProperty()
  @IsUUID()
  invoiceId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  amount!: number;
}

export class CreatePaymentDto {
  @ApiProperty()
  @IsUUID()
  customerId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  amount!: number;

  @ApiProperty({ example: 'cash' })
  @IsString()
  @MaxLength(32)
  method!: string;

  @ApiPropertyOptional({ description: 'Payment date (ISO); defaults to today' })
  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  referenceNo?: string;

  @ApiPropertyOptional({
    description: 'Explicit allocations; if omitted, auto-allocate to oldest invoices first',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations?: PaymentAllocationDto[];
}
