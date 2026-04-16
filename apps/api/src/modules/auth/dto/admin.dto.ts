import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MinLength, MaxLength } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({ enum: ['active', 'inactive'], example: 'active' })
  @IsIn(['active', 'inactive'], { message: 'Status must be "active" or "inactive"' })
  status!: 'active' | 'inactive';
}

export class AssignRoleDto {
  @ApiProperty({ example: 'manager', description: 'Role code to assign' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  roleCode!: string;
}
