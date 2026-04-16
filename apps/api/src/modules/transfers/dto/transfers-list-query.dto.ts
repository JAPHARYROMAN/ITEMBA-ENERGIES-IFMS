import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, MaxLength } from 'class-validator';
import { ListQueryDto } from '../../../common/dto/list-query.dto';

export class TransfersListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: 'Filter by transfer type' })
  @IsOptional()
  @MaxLength(50)
  transferType?: string;
}
