import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, MaxLength } from 'class-validator';
import { ListQueryDto } from '../../../common/dto/list-query.dto';

export class AuditListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: 'Filter by entity type' })
  @IsOptional()
  @MaxLength(100)
  entity?: string;

  @ApiPropertyOptional({ description: 'Filter by action type' })
  @IsOptional()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({ description: 'Filter by actor user ID' })
  @IsOptional()
  @IsUUID()
  actorUserId?: string;
}
