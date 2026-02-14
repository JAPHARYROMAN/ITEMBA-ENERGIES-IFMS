import { buildListResponse, type ListMeta, type ListResponse } from '../interfaces/response-envelope';
import { normalizePagination } from '../dto/pagination.dto';

export interface ListResult<T> {
  data: T[];
  total: number;
}

/**
 * Build a paginated list response from raw data and total count.
 * Use after running a paginated query and count query.
 */
export function createListResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): ListResponse<T> {
  const meta: ListMeta = {
    page,
    pageSize,
    total,
  };
  return buildListResponse(data, meta);
}

/**
 * Normalize query params and return offset/limit for DB + normalized page/pageSize.
 */
export function getListParams(query: { page?: number; pageSize?: number }) {
  return normalizePagination(query.page, query.pageSize);
}
