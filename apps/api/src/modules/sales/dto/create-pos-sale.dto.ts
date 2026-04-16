import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { SanitizeHtml } from '../../../common/decorators/sanitize.decorator';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class PosItemDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ description: 'Nozzle used for this sale line (required for inventory tracking)' })
  @IsUUID()
  nozzleId!: string;

  @ApiProperty({ description: 'Quantity or liters' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: 'quantity must be a positive number' })
  @Min(0.001)
  quantity!: number;

  @ApiProperty({ description: 'Unit price' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: 'unitPrice must be a positive number' })
  @Min(0)
  unitPrice!: number;

  @ApiPropertyOptional({ description: 'Tax amount for this line' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxAmount?: number;
}

export class PaymentSplitDto {
  @ApiProperty({ example: 'Cash', enum: ['Cash', 'Card', 'MobileMoney', 'Credit', 'Cheque', 'BankTransfer'] })
  @IsString()
  @IsIn(['Cash', 'Card', 'MobileMoney', 'Credit', 'Cheque', 'BankTransfer'], { message: 'paymentMethod must be one of: Cash, Card, MobileMoney, Credit, Cheque, BankTransfer' })
  @MaxLength(32)
  paymentMethod!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: 'amount must be a positive number' })
  @Min(0)
  amount!: number;
}

export class CreatePosSaleDto {
  @ApiProperty()
  @IsUUID()
  branchId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @ApiProperty({ type: [PosItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosItemDto)
  items!: PosItemDto[];

  @ApiProperty({ type: [PaymentSplitDto], description: 'Payment split must sum to total (within rounding tolerance)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentSplitDto)
  payments!: PaymentSplitDto[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional({ description: 'Required when discount exceeds threshold (manager)' })
  @SanitizeHtml()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  discountReason?: string;
}
