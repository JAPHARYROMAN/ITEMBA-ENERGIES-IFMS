import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ListApprovalsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  actionType?: string;

  @ApiPropertyOptional({ enum: ['draft', 'submitted', 'approved', 'rejected', 'cancelled'] })
  @IsOptional()
  @IsIn(['draft', 'submitted', 'approved', 'rejected', 'cancelled'])
  status?: 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';
}
