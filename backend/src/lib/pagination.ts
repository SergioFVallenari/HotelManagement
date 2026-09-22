export interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function parsePagination(query: Record<string, unknown>): Pagination {
  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(String(query.pageSize ?? '20'), 10) || 20),
  );
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginationMeta(total: number, pagination: Pagination) {
  return {
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pagination.pageSize),
  };
}

export function parseBool(value: unknown): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  return value === 'true' || value === '1';
}

export function parseIdParam(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error('INVALID_ID_PARAM');
  }
  return n;
}