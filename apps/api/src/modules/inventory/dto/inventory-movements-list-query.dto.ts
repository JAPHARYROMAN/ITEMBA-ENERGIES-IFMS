import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, MaxLength } from 'class-validator';
import { ListQueryDto } from '../../../common/dto/list-query.dto';

export class InventoryMovementsListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: 'Filter by classification' })
  @IsOptional()
  @MaxLength(50)
  classification?: string;
}
