import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@ifms.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '1618' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password!: string;
}
