import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export class PaginationDto {
  @ApiPropertyOptional({ default: DEFAULT_PAGE, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = DEFAULT_PAGE;

  @ApiPropertyOptional({ default: DEFAULT_PAGE_SIZE, minimum: 1, maximum: MAX_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number = DEFAULT_PAGE_SIZE;
}

export const getDefaultPage = () => DEFAULT_PAGE;
export const getDefaultPageSize = () => DEFAULT_PAGE_SIZE;
export const getMaxPageSize = () => MAX_PAGE_SIZE;

export function normalizePagination(page?: number, pageSize?: number): { page: number; pageSize: number; offset: number; limit: number } {
  const p = Math.max(1, Number(page) || DEFAULT_PAGE);
  const ps = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE));
  return { page: p, pageSize: ps, offset: (p - 1) * ps, limit: ps };
}
