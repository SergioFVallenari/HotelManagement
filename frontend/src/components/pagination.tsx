import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { PageMeta } from '../api/types';

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
  const pages = Array.from({ length: meta.totalPages }, (_, i) => i + 1);
  return (
    <nav aria-label="Paginación">
      <ul className="pagination pagination-sm justify-content-end mb-0">
        {pages.map((p) => (
          <li key={p} className={`page-item ${p === meta.page ? 'active' : ''}`}>
            <button
              type="button"
              className="page-link"
              onClick={() => onChange?.(p)}
            >
              {p}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}