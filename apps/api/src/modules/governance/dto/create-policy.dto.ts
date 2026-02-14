import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PolicyStepDto {
  @ApiProperty()
  @IsNumber()
  @Min(1)
  stepOrder!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  requiredRole?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  requiredPermission?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  dueHours?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowSelfApproval?: boolean;
}

export class CreatePolicyDto {
  @ApiProperty()
  @IsUUID()
  companyId!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  entityType!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  actionType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  thresholdAmount?: number;

  @ApiPropertyOptional({ description: 'Ratio (0.1 = 10%)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  thresholdPct?: number;

  @ApiProperty({ type: [PolicyStepDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PolicyStepDto)
  approvalSteps!: PolicyStepDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
