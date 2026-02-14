import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateExpenseEntryDto {
  @ApiProperty()
  @IsUUID()
  companyId!: string;

  @ApiProperty()
  @IsUUID()
  branchId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ maxLength: 64 })
  @IsString()
  @MaxLength(64)
  category!: string;

  @ApiProperty({ example: 25.5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  vendor!: string;

  @ApiProperty({ enum: ['petty_cash', 'bank', 'cash', 'card', 'other'] })
  @IsString()
  @IsIn(['petty_cash', 'bank', 'cash', 'card', 'other'])
  paymentMethod!: string;

  @ApiPropertyOptional({ maxLength: 1024 })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  description?: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  billableDepartment?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  attachmentName?: string;
}
