import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsNotEmptyObject } from 'class-validator';

export class FinancialInsightsDto {
  @ApiProperty({
    description: 'Financial metrics as key-value pairs',
    example: { totalSales: 50000, totalExpenses: 12000 },
  })
  @IsObject()
  @IsNotEmptyObject()
  metrics!: Record<string, unknown>;
}
