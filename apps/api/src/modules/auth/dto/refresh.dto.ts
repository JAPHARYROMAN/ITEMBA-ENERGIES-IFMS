import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token returned from login' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
