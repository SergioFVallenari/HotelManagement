export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}

export function ContentSkeleton({ variant = 'form' }: { variant?: 'form' | 'table' | 'list' | 'thread' | 'calendar' | 'page' }) {
  return (
    <div className={`content-skeleton content-skeleton--${variant}`} role="status" aria-label="Cargando contenido">
      <span className="visually-hidden">Cargando contenido</span>
      {variant === 'calendar' ? (
        <><Skeleton className="content-skeleton-heading" /><div className="content-skeleton-calendar">{Array.from({ length: 35 }, (_, index) => <Skeleton key={index} />)}</div></>
      ) : variant === 'thread' ? (
        <div className="content-skeleton-messages">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="content-skeleton-bubble" />)}</div>
      ) : variant === 'table' || variant === 'list' ? (
        <div className="content-skeleton-rows">{Array.from({ length: 5 }, (_, index) => <div className="content-skeleton-row" key={index}>{variant === 'list' && <Skeleton className="content-skeleton-avatar" />}<div className="content-skeleton-lines"><Skeleton /><Skeleton /></div>{variant === 'table' && <><Skeleton className="content-skeleton-cell" /><Skeleton className="content-skeleton-cell" /></>}</div>)}</div>
      ) : (
        <><Skeleton className="content-skeleton-heading" />{Array.from({ length: variant === 'page' ? 4 : 3 }, (_, index) => <div className="content-skeleton-field" key={index}><Skeleton /><Skeleton /></div>)}</>
      )}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Cargando resumen del dashboard">
      <span className="visually-hidden">Cargando resumen del dashboard</span>
      <div className="row g-3 mb-4 dashboard-metrics">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="col-sm-6 col-xl-3" key={index}>
            <div className="card h-100 shadow-sm metric-card"><div className="card-body dashboard-skeleton-metric">
              <Skeleton className="skeleton-icon" />
              <Skeleton className="skeleton-label" />
              <Skeleton className="skeleton-value" />
              <Skeleton className="skeleton-description" />
            </div></div>
          </div>
        ))}
      </div>
      <div className="row g-3 dashboard-breakdown">
        {Array.from({ length: 2 }, (_, index) => (
          <div className="col-lg-6" key={index}>
            <div className="card shadow-sm h-100"><div className="card-body dashboard-skeleton-breakdown">
              <Skeleton className="skeleton-heading" />
              {Array.from({ length: 3 }, (_, row) => <Skeleton className="skeleton-row" key={row} />)}
            </div></div>
          </div>
        ))}
      </div>
      <div className="row g-3 dashboard-charts">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="col-lg-4" key={index}>
            <div className="card shadow-sm h-100"><div className="card-body dashboard-skeleton-chart">
              <Skeleton className="skeleton-heading" />
              <div className="dashboard-skeleton-bars" aria-hidden="true">
                {Array.from({ length: 9 }, (_, bar) => <Skeleton key={bar} className="skeleton-bar" />)}
              </div>
            </div></div>
          </div>
        ))}
      </div>
    </div>
  );
}
