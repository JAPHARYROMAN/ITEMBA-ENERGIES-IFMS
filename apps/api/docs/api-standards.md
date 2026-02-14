# IFMS REST API Standards

This document defines the conventions used across the backend for list endpoints, query parameters, response shape, and errors.

## 1. Pagination

All list endpoints support:

| Parameter  | Type   | Default | Max   | Description        |
|------------|--------|---------|-------|--------------------|
| `page`     | number | 1       | -     | 1-based page index |
| `pageSize` | number | 25      | 100   | Items per page     |

**Example:** `GET /api/companies?page=1&pageSize=25`

- Shared DTO: `PaginationDto` or combined `ListQueryDto` (see `src/common/dto/`).
- Use `getListParams(query)` to get `{ page, pageSize, offset, limit }` for DB queries.

---

## 2. Sorting

List endpoints support a single sort parameter:

| Parameter | Format        | Example           |
|----------|---------------|-------------------|
| `sort`   | `field:asc` or `field:desc` | `created_at:desc` |

**Example:** `GET /api/companies?sort=code:asc`

- Validation: allowed pattern `^[\w.]+:(asc|desc)$`.
- Parse with `parseSort(sort)` from `src/common/dto/sort.dto.ts`.
- Each module should whitelist sortable fields (e.g. `created_at`, `code`, `name`).

---

## 3. Filtering

Common query parameters for scoped list endpoints:

| Parameter   | Type   | Description              |
|------------|--------|--------------------------|
| `companyId`| UUID   | Filter by company        |
| `branchId` | UUID   | Filter by branch         |
| `dateFrom` | ISO 8601 date | From date (inclusive) |
| `dateTo`   | ISO 8601 date | To date (inclusive)   |
| `q`        | string | Search (e.g. code, name); max 200 chars |

**Example:** `GET /api/companies?q=GEC&companyId=...&dateFrom=2025-01-01`

- Use `ListFilterDto` or the combined `ListQueryDto`.
- Not all parameters apply to every endpoint (e.g. companies list may only use `q`).

---

## 4. Response Envelope (List)

All list responses use this shape:

```json
{
  "data": [ ... ],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 42
  }
}
```

- **data**: array of items for the current page.
- **meta.page**: current page (1-based).
- **meta.pageSize**: size of the current page.
- **meta.total**: total number of items (for the applied filters).

Implementation:

- Types: `ListResponse<T>`, `ListMeta` in `src/common/interfaces/response-envelope.ts`.
- Helper: `createListResponse(data, total, page, pageSize)` in `src/common/helpers/list.helper.ts`.
- Base: extend `BaseListController` and call `this.listResponse(data, total, query)`.

---

## 5. Error Response (Problem Details)

All errors return a consistent JSON shape:

```json
{
  "type": "https://api.ifms.local/errors#404",
  "statusCode": 404,
  "error": "Not Found",
  "message": "Company not found",
  "timestamp": "2025-02-14T12:00:00.000Z",
  "path": "/api/companies/123",
  "requestId": "uuid"
}
```

| Field       | Description                                      |
|------------|---------------------------------------------------|
| `type`     | URI reference for the error (by status code)     |
| `statusCode` | HTTP status code                              |
| `error`    | Short label (e.g. "Bad Request", "Unauthorized") |
| `message`  | Human-readable detail (string or array)          |
| `timestamp`| ISO 8601 when the error occurred                 |
| `path`     | Request path                                      |
| `requestId`| Request id (when present)                         |

- Implemented in `HttpExceptionFilter`; all thrown exceptions are normalized to this shape.
- `requestId` is set by `RequestIdMiddleware` and echoed in the `x-request-id` response header.

---

## 6. Validation

- **Global:** `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.
- **DTOs:** Use `class-validator` decorators (`@IsOptional()`, `@IsUUID()`, `@Min()`, `@Max()`, `@Matches()`, etc.) and `class-transformer` (`@Type()`) where needed.
- Query params are validated automatically when using a DTO with `@Query()`.

---

## 7. Applying the Standard to a List Endpoint

1. **Query:** Use `ListQueryDto` (or compose `PaginationDto` + `SortDto` + `ListFilterDto`).
2. **Params:** Call `getListParams(query)` for `offset`/`limit` and normalized `page`/`pageSize`.
3. **Service:** Return `{ data, total }` from a paginated query + count.
4. **Controller:** Return `this.listResponse(data, total, query)` (when extending `BaseListController`) or `createListResponse(data, total, page, pageSize)`.

**Reference implementation:** `GET /api/companies` in `CompaniesController` and `CompaniesService` (pagination, sort, search `q`, response envelope).

---

## 8. File Reference

| Purpose           | Location |
|-------------------|----------|
| Pagination DTO    | `src/common/dto/pagination.dto.ts` |
| Sort DTO          | `src/common/dto/sort.dto.ts` |
| Filter DTO        | `src/common/dto/list-filter.dto.ts` |
| Combined list query| `src/common/dto/list-query.dto.ts` |
| List response type| `src/common/interfaces/response-envelope.ts` |
| List helper        | `src/common/helpers/list.helper.ts` |
| Base list controller | `src/common/base/base-list.controller.ts` |
| Error filter       | `src/common/filters/http-exception.filter.ts` |
| Example list endpoint | `src/modules/core/companies.controller.ts` |
