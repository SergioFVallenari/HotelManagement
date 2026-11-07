import type { Key, ReactNode } from 'react';
import { LoadState } from './Feedback';
import { PaginationBar } from './pagination';
import type { PageMeta } from '../api/types';

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
  const table = (
    <div className="table-responsive">
      <table className={`table align-middle responsive-table ${size === 'sm' ? 'table-sm mb-2' : 'mb-0'} ${className}`}>
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
          {rows.map((row) => (
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

  if (variant === 'bare') return table;

  return (
    <div className="card shadow-sm">
      <div className="card-body p-0">
        <LoadState loading={loading ?? false} error={error ?? null} onRetry={onRetry} empty={empty ?? rows.length === 0} />
        {rows.length > 0 && (
          <>
            {table}
            <div className="p-3 border-top">
              <PaginationBar meta={meta} onChange={onPageChange} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
