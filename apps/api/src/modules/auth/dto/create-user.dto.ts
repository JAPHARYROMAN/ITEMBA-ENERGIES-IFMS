import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { SignupDto } from './signup.dto';

export class CreateUserDto extends SignupDto {
  @ApiPropertyOptional({ example: 'manager' })
  @IsOptional()
  @IsString()
  roleCode?: string;
}
