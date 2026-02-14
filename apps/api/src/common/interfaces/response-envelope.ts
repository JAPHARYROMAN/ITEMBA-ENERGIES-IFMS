/**
 * Standard list response envelope: { data, meta }.
 * All list endpoints should return this shape.
 */
export interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface ListResponse<T> {
  data: T[];
  meta: ListMeta;
}

export function buildListResponse<T>(data: T[], meta: ListMeta): ListResponse<T> {
  return { data, meta };
}
