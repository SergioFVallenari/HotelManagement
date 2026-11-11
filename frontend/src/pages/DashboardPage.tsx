import { useState } from 'react';
import { useApi } from '../api/useApi';
import { buildQuery } from '../api/client';
import type { Summary } from '../api/types';
import { LoadState } from '../components/Feedback';
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
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(lastDayOfMonth());
  const [query, setQuery] = useState(buildQuery({ from: firstDayOfMonth(), to: lastDayOfMonth() }));
  const { data, loading, error, reload } = useApi<{ data: Summary }>(`/summary${query}`);
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

      <LoadState loading={loading} error={error} onRetry={reload} />

      {summary && (
        <>
          <div className="row g-3 mb-4 dashboard-metrics">
            <div className="col-sm-6 col-xl-3">
              <div className="card h-100 shadow-sm metric-card">
                <div className="card-body">
                  <span className="metric-symbol" aria-hidden="true" />
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
                  <span className="metric-symbol" aria-hidden="true" />
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
                  <span className="metric-symbol" aria-hidden="true" />
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
                  <span className="metric-symbol" aria-hidden="true" />
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
                <div className="card-header bg-white fw-semibold">Distribución por estado</div>
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
                <div className="card-header bg-white fw-semibold">Ingresos por medio de pago</div>
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
                <div className="card-header bg-white fw-semibold">Ocupación diaria</div>
                <div className="card-body">
                  {summary.daily.length === 0 ? (
                    <p className="text-secondary mb-0">Sin datos en el período.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart data={summary.daily} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="date" tickFormatter={(d: string) => dateShort(d).slice(0, 5)} tick={{ fontSize: 10 }} minTickGap={48} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} hide />
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
                <div className="card-header bg-white fw-semibold">Ingresos por día</div>
                <div className="card-body">
                  {summary.daily.length === 0 ? (
                    <p className="text-secondary mb-0">Sin datos en el período.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart data={summary.daily} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid vertical={false} />
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
                <div className="card-header bg-white fw-semibold">Actividad diaria</div>
                <div className="card-body">
                  {summary.daily.length === 0 ? (
                    <p className="text-secondary mb-0">Sin datos en el período.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart data={summary.daily} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="date" tickFormatter={(d: string) => dateShort(d).slice(0, 5)} tick={{ fontSize: 10 }} minTickGap={48} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} hide />
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
