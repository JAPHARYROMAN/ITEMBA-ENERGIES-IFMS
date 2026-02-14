import { IsString, MaxLength, MinLength } from 'class-validator';

export class CustomerNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note!: string;
}

