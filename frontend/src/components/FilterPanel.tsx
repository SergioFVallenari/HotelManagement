import { useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { IconChevronDown, IconFilter } from '@tabler/icons-react';

interface FilterPanelProps {
  children: ReactNode;
  activeCount?: number;
  onApply?: () => void;
  title?: string;
}

export function FilterPanel({ children, activeCount = 0, onApply, title }: FilterPanelProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onApply) return;
    onApply();
    if (window.matchMedia('(max-width: 767.98px)').matches) toggleRef.current?.focus();
    setOpen(false);
  }

  return (
    <section className="card shadow-sm mb-4 filters-panel" aria-label="Filtros">
      <button
        ref={toggleRef}
        type="button"
        className="filters-panel-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
      >
        <IconFilter size={20} aria-hidden="true" />
        <span>Filtros</span>
        {activeCount > 0 && <span className="badge text-bg-primary">{activeCount}<span className="visually-hidden"> filtros aplicados</span></span>}
        <IconChevronDown size={18} className="filters-panel-chevron" aria-hidden="true" />
      </button>
      <div id={id} className={`filters-panel-body${open ? ' is-open' : ''}`}>
        {title && <div className="filter-panel-title">{title}</div>}
        <form className="filter-row" onSubmit={submit}>
          {children}
        </form>
      </div>
    </section>
  );
}
