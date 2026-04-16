import { IsUUID } from 'class-validator';

export class ExportIdParamDto {
  @IsUUID()
  exportId!: string;
}
