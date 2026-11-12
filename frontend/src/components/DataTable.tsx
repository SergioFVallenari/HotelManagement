import { useEffect, useState } from 'react';
import type { Key, ReactNode } from 'react';
import { LoadState } from './Feedback';
import { PaginationBar } from './pagination';
import type { PageMeta } from '../api/types';
import { DATA_TABLE_PAGE_SIZE } from '../lib/pagination';

export interface Column<T> {
  header: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyField: string | ((row: T) => Key);
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: boolean;
  meta?: PageMeta;
  onPageChange?: (page: number) => void;
  actions?: (row: T) => ReactNode;
  size?: 'md' | 'sm';
  variant?: 'card' | 'bare';
  className?: string;
}

function valueAt<T>(row: T, keyField: string | ((row: T) => Key)): Key {
  return typeof keyField === 'function' ? keyField(row) : String((row as Record<string, unknown>)[keyField] as Key);
}

export function DataTable<T>({
  columns,
  rows,
  keyField,
  loading,
  error,
  onRetry,
  empty,
  meta,
  onPageChange,
  actions,
  size = 'md',
  variant = 'card',
  className = '',
}: DataTableProps<T>) {
  const [localPage, setLocalPage] = useState(1);
  useEffect(() => {
    if (!loading && meta && meta.page > Math.max(1, meta.totalPages)) {
      onPageChange?.(Math.max(1, meta.totalPages));
    }
  }, [loading, meta, onPageChange]);
  const totalPages = Math.max(1, Math.ceil(rows.length / DATA_TABLE_PAGE_SIZE));
  const currentPage = Math.min(localPage, totalPages);
  const visibleRows = meta ? rows : rows.slice((currentPage - 1) * DATA_TABLE_PAGE_SIZE, currentPage * DATA_TABLE_PAGE_SIZE);
  const paginationMeta = meta ?? { page: currentPage, pageSize: DATA_TABLE_PAGE_SIZE, total: rows.length, totalPages };
  const pagination = paginationMeta.totalPages > 1 && (
    <div className="p-3 border-top">
      <PaginationBar meta={paginationMeta} onChange={meta ? onPageChange : setLocalPage} />
    </div>
  );
  const table = (
    <div className="table-responsive">
      <table className={`table align-middle responsive-table data-table ${size === 'sm' ? 'table-sm mb-2' : 'mb-0'} ${className}`}>
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i} scope="col" className={col.align === 'end' ? 'text-end' : col.align === 'center' ? 'text-center' : undefined}>
                {col.header}
              </th>
            ))}
            {actions && <th scope="col" className="text-end">Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={valueAt(row, keyField)}>
              {columns.map((col, i) => (
                <td
                  key={i}
                  data-label={typeof col.header === 'string' || typeof col.header === 'number' ? String(col.header) : undefined}
                  className={`${col.align === 'end' ? 'text-end' : col.align === 'center' ? 'text-center' : ''} ${col.className ?? ''}`}
                >
                  <div className="table-cell-value">{col.render(row)}</div>
                </td>
              ))}
              {actions && <td data-label="Acciones" className="text-end table-actions">{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (variant === 'bare') {
    if (loading || error) return <LoadState loading={loading ?? false} error={error ?? null} onRetry={onRetry} skeleton="table" />;
    return <>{table}{pagination}</>;
  }

  return (
    <div className="card shadow-sm">
      <div className="card-body p-0">
        <LoadState loading={loading ?? false} error={error ?? null} onRetry={onRetry} empty={empty ?? rows.length === 0} skeleton="table" />
        {!loading && !error && rows.length > 0 && (
          <>
            {table}
            {pagination}
          </>
        )}
      </div>
    </div>
  );
}
