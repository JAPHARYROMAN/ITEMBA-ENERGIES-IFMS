import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

/** Single sort: field:asc or field:desc. Example: created_at:desc */
const SORT_PATTERN = /^[\w.]+:(asc|desc)$/i;

export class SortDto {
  @ApiPropertyOptional({ example: 'created_at:desc', description: 'Sort by field:asc or field:desc' })
  @IsOptional()
  @Matches(SORT_PATTERN, { message: 'sort must be field:asc or field:desc (e.g. created_at:desc)' })
  sort?: string;
}

export function parseSort(sort?: string): { field: string; direction: 'asc' | 'desc' } | null {
  if (!sort || !SORT_PATTERN.test(sort)) return null;
  const [field, dir] = sort.split(':');
  return { field, direction: dir.toLowerCase() as 'asc' | 'desc' };
}
