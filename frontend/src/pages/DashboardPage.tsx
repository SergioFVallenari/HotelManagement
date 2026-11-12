import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconActivity, IconAlertCircle, IconArrowRight, IconBed, IconCalendarCheck, IconChartBar, IconCreditCard, IconDoorEnter, IconDoorExit, IconWallet } from '@tabler/icons-react';
import { useApi } from '../api/useApi';
import { buildQuery } from '../api/client';
import type { Summary } from '../api/types';
import { LoadState } from '../components/Feedback';
import { DashboardSkeleton, Skeleton } from '../components/Skeleton';
import { FilterPanel } from '../components/FilterPanel';
import { StatusBadge } from '../components/Badge';
import { dateShort, firstDayOfMonth, lastDayOfMonth, money, PAYMENT_METHODS, today } from '../lib/format';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export function DashboardPage() {
  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(lastDayOfMonth());
  const [query, setQuery] = useState(buildQuery({ from: firstDayOfMonth(), to: lastDayOfMonth() }));
  const { data, loading, error, reload } = useApi<{ data: Summary }>(`/summary${query}`);
  const operations = useApi<{ data: { date: string; checkIns: number; checkOuts: number; pending: number } }>('/summary/operations', { pollMs: 30_000 });
  const currentDay = operations.data?.data.date ?? today();
  const summary = data?.data;

  const occupiedPct = summary?.occupancy.occupancyPct ?? 0;
  const revenue = summary?.revenue.total ?? 0;

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <div>
          <h1 className="mb-2">Visión general</h1>
          <p className="text-secondary mb-0">Controlá la ocupación, los ingresos y la actividad de tu alojamiento.</p>
        </div>
      </div>
        <FilterPanel onApply={() => setQuery(buildQuery({ from, to }))}>
          <fieldset className="dashboard-period">
            <legend>Período</legend>
            <div className="d-flex align-items-center">
              <label className="mb-0 flex-grow-1">
                <span className="visually-hidden">Desde</span>
                <input type="date" className="form-control form-control-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <span className="text-secondary px-1" aria-hidden="true">—</span>
              <label className="mb-0 flex-grow-1">
                <span className="visually-hidden">Hasta</span>
                <input type="date" className="form-control form-control-sm" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
          </fieldset>
          <button
            type="submit"
            className="btn btn-primary btn-sm ms-md-auto"
          >
            Aplicar filtros
          </button>
        </FilterPanel>

      {!loading && <LoadState loading={false} error={error} onRetry={reload} />}

      <section className="dashboard-operations mb-4" aria-labelledby="dashboard-operations-title">
        <div className="dashboard-operations-heading">
          <div>
            <h2 id="dashboard-operations-title">Recepción hoy</h2>
            <p>Seguimiento independiente del período seleccionado · {dateShort(currentDay)}</p>
          </div>
          <Link to="/reservations" className="dashboard-operations-link">Ver reservas <IconArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        <div className="dashboard-operations-grid">
          <div className="dashboard-operation">
            <span className="dashboard-operation-icon" aria-hidden="true"><IconDoorEnter size={20} /></span>
            <div><span>Check-ins realizados</span><strong>{operations.loading && !operations.data ? <><span className="visually-hidden">Cargando</span><Skeleton className="skeleton-operation-value" /></> : operations.error ? '—' : operations.data?.data.checkIns ?? '—'}</strong></div>
          </div>
          <div className="dashboard-operation">
            <span className="dashboard-operation-icon dashboard-operation-icon--blue" aria-hidden="true"><IconDoorExit size={20} /></span>
            <div><span>Check-outs realizados</span><strong>{operations.loading && !operations.data ? <><span className="visually-hidden">Cargando</span><Skeleton className="skeleton-operation-value" /></> : operations.error ? '—' : operations.data?.data.checkOuts ?? '—'}</strong></div>
          </div>
          <div className="dashboard-operation">
            <span className="dashboard-operation-icon dashboard-operation-icon--warning" aria-hidden="true"><IconAlertCircle size={20} /></span>
            <div><span>Solicitudes de WhatsApp por verificar</span><strong>{operations.loading && !operations.data ? <><span className="visually-hidden">Cargando</span><Skeleton className="skeleton-operation-value" /></> : operations.error ? '—' : operations.data?.data.pending ?? '—'}</strong></div>
          </div>
        </div>
        {operations.error && <p className="dashboard-operations-error" role="status">No se pudieron actualizar los datos de recepción. <button type="button" onClick={operations.reload}>Reintentar</button></p>}
        <p className="dashboard-operations-note">Los movimientos indican operaciones realizadas hoy; las solicitudes incluyen todas las pendientes, sin límite de fecha.</p>
      </section>

      {loading && <DashboardSkeleton />}
      {!loading && !error && summary && (
        <>
          <div className="row g-3 mb-4 dashboard-metrics">
            <div className="col-sm-6 col-xl-3">
              <div className="card h-100 shadow-sm metric-card">
                <div className="card-body">
                  <span className="metric-symbol" aria-hidden="true"><IconBed size={21} stroke={1.8} /></span>
                  <div className="text-secondary small text-uppercase">Ocupación</div>
                  <div className="card-value">{occupiedPct.toFixed(1)}%</div>
                  <div className="text-secondary small">
                    {summary.occupancy.occupiedRoomNights} de {summary.occupancy.totalRoomNights} noches ocupadas
                  </div>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-xl-3">
              <div className="card h-100 shadow-sm metric-card metric-card--cyan">
                <div className="card-body">
                  <span className="metric-symbol" aria-hidden="true"><IconWallet size={21} stroke={1.8} /></span>
                  <div className="text-secondary small text-uppercase">Ingresos</div>
                  <div className="card-value">{money(revenue)}</div>
                  <div className="text-secondary small">
                    {dateShort(summary.range.from)} → {dateShort(summary.range.to)} · {summary.range.days} días
                  </div>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-xl-3">
              <div className="card h-100 shadow-sm metric-card">
                <div className="card-body">
                  <span className="metric-symbol" aria-hidden="true"><IconActivity size={21} stroke={1.8} /></span>
                  <div className="text-secondary small text-uppercase">Actividad</div>
                  <div className="card-value">
                    {summary.reservationsPage.created}
                  </div>
                  <div className="text-secondary small">
                    {summary.reservationsPage.checkIns} check-ins · {summary.reservationsPage.checkOuts} check-outs
                  </div>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-xl-3">
              <div className="card h-100 shadow-sm metric-card">
                <div className="card-body">
                  <span className="metric-symbol" aria-hidden="true"><IconDoorEnter size={21} stroke={1.8} /></span>
                  <div className="text-secondary small text-uppercase">Disponibilidad</div>
                  <div className="card-value">{summary.occupancy.availableRoomNights}</div>
                  <div className="text-secondary small">noches disponibles de {summary.occupancy.totalRoomNights}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="row g-3 dashboard-breakdown">
            <div className="col-lg-6">
              <div className="card shadow-sm h-100">
                <div className="card-header bg-white fw-semibold"><IconChartBar size={19} aria-hidden="true" /> Distribución por estado</div>
                <div className="card-body">
                  {summary.statusDistribution.length === 0 ? (
                    <p className="text-secondary mb-0">Sin reservas en el período.</p>
                  ) : (
                    <div className="status-bars">
                      {(() => {
                        const order = ['PENDING', 'RESERVED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'];
                        const sorted = [...summary.statusDistribution].sort(
                          (a, b) => order.indexOf(a.status) - order.indexOf(b.status),
                        );
                        const maxCount = Math.max(...sorted.map((e) => e.count), 1);
                        return sorted.map((entry) => (
                          <div className="status-bar-row d-flex align-items-center gap-3" key={entry.status} data-status={entry.status}>
                            <StatusBadge status={entry.status} />
                            <span className="bar-track">
                              <span
                                  className="bar-fill"
                                  aria-hidden="true"
                                style={{ width: `${(entry.count / maxCount) * 100}%` }}
                              />
                            </span>
                            <strong>{entry.count}</strong>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="card shadow-sm h-100">
                <div className="card-header bg-white fw-semibold"><IconCreditCard size={19} aria-hidden="true" /> Ingresos por medio de pago</div>
                <div className="card-body">
                  {Object.keys(summary.revenue.byMethod).length === 0 ? (
                    <p className="text-secondary mb-0">No hay pagos registrados en el período.</p>
                  ) : (
                    <table className="table align-middle mb-0" aria-label="Ingresos por medio de pago">
                      <tbody>
                        {Object.entries(summary.revenue.byMethod).map(([method, amount]) => (
                          <tr key={method}>
                            <th scope="row" className="fw-normal">{PAYMENT_METHODS[method] ?? method}</th>
                            <td className="text-end fw-bold">{money(amount)}</td>
                          </tr>
                        ))}
                        <tr className="fw-semibold">
                          <th scope="row">Total</th>
                          <td className="text-end">{money(revenue)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="row g-3 dashboard-charts">
            <div className="col-lg-4">
              <div className="card shadow-sm h-100">
                <div className="card-header bg-white fw-semibold"><IconBed size={19} aria-hidden="true" /> Ocupación diaria</div>
                <div className="card-body">
                  {summary.daily.length === 0 ? (
                    <p className="text-secondary mb-0">Sin datos en el período.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={210}>
                      <BarChart data={summary.daily} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="var(--gh-surface-muted)" strokeDasharray="3 3" />
                        <XAxis dataKey="date" tickFormatter={(d: string) => dateShort(d).slice(0, 5)} tick={{ fontSize: 10 }} minTickGap={48} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} tick={{ fontSize: 10, fill: 'var(--gh-text-muted)' }} axisLine={false} tickLine={false} width={40} />
                        <Tooltip
                          labelFormatter={(d) => dateShort(String(d))}
                          formatter={(value) => [`${Number(value ?? 0)}%`, 'Ocupación']}
                        />
                        <Bar dataKey="occupancyPct" name="Ocupación" fill="var(--crm-violet)" radius={[4, 4, 4, 4]} maxBarSize={13} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
            <div className="col-lg-4">
              <div className="card shadow-sm h-100">
                <div className="card-header bg-white fw-semibold"><IconWallet size={19} aria-hidden="true" /> Ingresos por día</div>
                <div className="card-body">
                  {summary.daily.length === 0 ? (
                    <p className="text-secondary mb-0">Sin datos en el período.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={210}>
                      <BarChart data={summary.daily} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="var(--gh-surface-muted)" strokeDasharray="3 3" />
                        <XAxis dataKey="date" tickFormatter={(d: string) => dateShort(d).slice(0, 5)} tick={{ fontSize: 10 }} minTickGap={48} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip
                          labelFormatter={(d) => dateShort(String(d))}
                          formatter={(value) => [money(Number(value ?? 0)), 'Ingresos']}
                        />
                        <Bar dataKey="revenue" name="Ingresos" fill="var(--crm-cyan)" radius={[4, 4, 4, 4]} maxBarSize={13} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
            <div className="col-lg-4">
              <div className="card shadow-sm h-100">
                <div className="card-header bg-white fw-semibold"><IconCalendarCheck size={19} aria-hidden="true" /> Actividad diaria</div>
                <div className="card-body">
                  {summary.daily.length === 0 ? (
                    <p className="text-secondary mb-0">Sin datos en el período.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={210}>
                      <BarChart data={summary.daily} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="var(--gh-surface-muted)" strokeDasharray="3 3" />
                        <XAxis dataKey="date" tickFormatter={(d: string) => dateShort(d).slice(0, 5)} tick={{ fontSize: 10 }} minTickGap={48} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--gh-text-muted)' }} axisLine={false} tickLine={false} width={30} />
                        <Tooltip labelFormatter={(d) => dateShort(String(d))} />
                        <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="created" name="Creadas" fill="var(--crm-violet)" radius={[4, 4, 0, 0]} maxBarSize={13} />
                        <Bar dataKey="checkIns" name="Check-ins" fill="var(--crm-cyan)" radius={[4, 4, 0, 0]} maxBarSize={13} />
                        <Bar dataKey="checkOuts" name="Check-outs" fill="var(--crm-blue)" radius={[4, 4, 0, 0]} maxBarSize={13} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
