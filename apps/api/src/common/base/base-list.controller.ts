import { createListResponse, getListParams } from '../helpers/list.helper';
import type { ListResponse } from '../interfaces/response-envelope';

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

/**
 * Helper for list endpoints: normalize pagination and build envelope.
 * Usage in controller:
 *   const params = getListParams(query);
 *   const { data, total } = await this.service.findPage(params, sort, filter);
 *   return this.listResponse(data, total, params);
 */
export abstract class BaseListController {
  protected listResponse<T>(data: T[], total: number, query: PaginationQuery): ListResponse<T> {
    const { page, pageSize } = getListParams(query);
    return createListResponse(data, total, page, pageSize);
  }

  protected getListParams(query: PaginationQuery) {
    return getListParams(query);
  }
}
