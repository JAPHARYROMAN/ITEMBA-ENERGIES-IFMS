import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty()
  @IsUUID()
  branchId!: string;

  @ApiProperty({ example: 'CUST-001' })
  @IsString()
  @MaxLength(32)
  code!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  taxId?: string;

  @ApiProperty({ description: 'Credit limit (0 = no limit enforced)' })
  @IsNumber()
  @Min(0)
  creditLimit!: number;

  @ApiProperty({ example: 'net30' })
  @IsString()
  @MaxLength(32)
  paymentTerms!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;
}
