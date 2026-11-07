import { Fragment, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { PageMeta } from '../api/types';
import { visiblePages } from '../lib/pagination';

export function useApiError(): { error: string | null; clearError: () => void; handleError: (err: unknown) => void } {
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) setError(null);
  }, [user]);

  const handleError = (err: unknown) => {
    console.error(err);
    setError((err as Error).message ?? 'Error inesperado');
  };

  return { error, clearError: () => setError(null), handleError };
}

export function PaginationBar({ meta, onChange }: { meta?: PageMeta; onChange?: (page: number) => void }) {
  if (!meta || meta.totalPages <= 1) return null;
  const pages = visiblePages(meta.page, meta.totalPages);
  return (
    <nav aria-label="Paginación" className="pagination-bar">
      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={meta.page <= 1} onClick={() => onChange?.(meta.page - 1)}>Anterior</button>
      <span className="pagination-summary">{meta.page} de {meta.totalPages}</span>
      <ul className="pagination pagination-sm mb-0 pagination-pages">
        {pages.map((p, index) => (
          <Fragment key={p}>
            {index > 0 && p - pages[index - 1] > 1 && <li className="page-item disabled" aria-hidden="true"><span className="page-link">…</span></li>}
            <li className={`page-item ${p === meta.page ? 'active' : ''}`}>
              <button
                type="button"
                className="page-link"
                aria-label={`Página ${p}`}
                aria-current={p === meta.page ? 'page' : undefined}
                onClick={() => onChange?.(p)}
              >
                {p}
              </button>
            </li>
          </Fragment>
        ))}
      </ul>
      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={meta.page >= meta.totalPages} onClick={() => onChange?.(meta.page + 1)}>Siguiente</button>
    </nav>
  );
}
