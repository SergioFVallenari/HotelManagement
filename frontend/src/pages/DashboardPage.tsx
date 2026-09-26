import { useState } from 'react';
import { useApi } from '../api/useApi';
import { buildQuery } from '../api/client';
import type { Summary } from '../api/types';
import { LoadState } from '../components/Feedback';
import { StatusBadge } from '../components/Badge';
import { RESERVATION_STATUS, dateShort, firstDayOfMonth, money, PAYMENT_METHODS, today } from '../lib/format';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export function DashboardPage() {
  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(today());
  const [query, setQuery] = useState(buildQuery({ from: firstDayOfMonth(), to: today() }));
  const { data, loading, error, reload } = useApi<{ data: Summary }>(`/summary${query}`);
  const summary = data?.data;

  const occupiedPct = summary?.occupancy.occupancyPct ?? 0;
  const revenue = summary?.revenue.total ?? 0;

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="h4 mb-1">Dashboard</h1>
          <p className="text-secondary mb-0">Resumen de ocupación e ingresos del período</p>
        </div>
        <div className="filter-row">
          <div className="input-group mb-0" style={{ width: 'auto', flex: '0 1 auto' }}>
            <span className="input-group-text">Desde</span>
            <input type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="input-group mb-0" style={{ width: 'auto', flex: '0 1 auto' }}>
            <span className="input-group-text">Hasta</span>
            <input type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setQuery(buildQuery({ from, to }))}
          >
            Aplicar
          </button>
        </div>
      </div>

      <LoadState loading={loading} error={error} onRetry={reload} />

      {summary && (
        <>
          <div className="row g-3 mb-4">
            <div className="col-sm-6 col-xl-3">
              <div className="card h-100 shadow-sm border-0">
                <div className="card-body">
                  <div className="text-secondary small text-uppercase">Ocupación del período</div>
                  <div className="card-value">{occupiedPct.toFixed(1)}%</div>
                  <div className="text-secondary small">
                    {summary.occupancy.occupiedRoomNights} de {summary.occupancy.totalRoomNights} noches-habitación ocupadas
                  </div>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-xl-3">
              <div className="card h-100 shadow-sm border-0">
                <div className="card-body">
                  <div className="text-secondary small text-uppercase">Ingresos por pagos</div>
                  <div className="card-value">{money(revenue)}</div>
                  <div className="text-secondary small">
                    Período: {dateShort(summary.range.from)} → {dateShort(summary.range.to)} ({summary.range.days} días)
                  </div>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-xl-3">
              <div className="card h-100 shadow-sm border-0">
                <div className="card-body">
                  <div className="text-secondary small text-uppercase">Actividad del período</div>
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
              <div className="card h-100 shadow-sm border-0">
                <div className="card-body">
                  <div className="text-secondary small text-uppercase">Noches disponibles</div>
                  <div className="card-value">{summary.occupancy.availableRoomNights}</div>
                  <div className="text-secondary small">de {summary.occupancy.totalRoomNights} totales</div>
                </div>
              </div>
            </div>
          </div>

          <div className="row g-3">
            <div className="col-lg-6">
              <div className="card shadow-sm">
                <div className="card-header bg-white fw-semibold">Distribución por estado</div>
                <div className="card-body">
                  {summary.statusDistribution.length === 0 ? (
                    <p className="text-secondary mb-0">Sin reservas activas en el período.</p>
                  ) : (
                    <div className="status-bars">
                      {(() => {
                        const maxCount = Math.max(...summary.statusDistribution.map((e) => e.count), 1);
                        return summary.statusDistribution.map((entry) => (
                          <div className="status-bar-row d-flex align-items-center gap-3" key={entry.status}>
                            <StatusBadge status={entry.status} />
                            <span className="bar-track">
                              <span
                                className="bar-fill"
                                style={{ width: `${(entry.count / maxCount) * 100}%` }}
                              />
                            </span>
                            <strong>{entry.count}</strong>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                  <div className="mt-3">
                    {['PENDING', 'RESERVED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'].map((s) => (
                      <p key={s} className="legend-row mb-1">
                        <StatusBadge status={s} /> {RESERVATION_STATUS[s]?.label}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="card shadow-sm">
                <div className="card-header bg-white fw-semibold">Ingresos por medio de pago</div>
                <div className="card-body">
                  {Object.keys(summary.revenue.byMethod).length === 0 ? (
                    <p className="text-secondary mb-0">No hay pagos registrados en el período.</p>
                  ) : (
                    <table className="table align-middle mb-0">
                      <tbody>
                        {Object.entries(summary.revenue.byMethod).map(([method, amount]) => (
                          <tr key={method}>
                            <td>{PAYMENT_METHODS[method] ?? method}</td>
                            <td className="text-end">{money(amount)}</td>
                          </tr>
                        ))}
                        <tr className="table-light fw-semibold">
                          <td>Total</td>
                          <td className="text-end">{money(revenue)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="row g-3 mt-3">
            <div className="col-lg-4">
              <div className="card shadow-sm h-100">
                <div className="card-header bg-white fw-semibold">Ocupación diaria</div>
                <div className="card-body">
                  {summary.daily.length === 0 ? (
                    <p className="text-secondary mb-0">Sin datos en el período.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={summary.daily} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <defs>
                          <linearGradient id="occGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0d6efd" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#0d6efd" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={(d: string) => dateShort(d).slice(0, 5)} tick={{ fontSize: 11 }} minTickGap={24} />
                        <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11 }} width={36} />
                        <Tooltip
                          labelFormatter={(d) => dateShort(String(d))}
                          formatter={(value) => [`${Number(value ?? 0)}%`, 'Ocupación']}
                        />
                        <Area type="monotone" dataKey="occupancyPct" name="Ocupación" stroke="#0d6efd" fill="url(#occGrad)" strokeWidth={2} />
                      </AreaChart>
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
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={summary.daily} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={(d: string) => dateShort(d).slice(0, 5)} tick={{ fontSize: 11 }} minTickGap={24} />
                        <YAxis tickFormatter={(v: number) => `${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} tick={{ fontSize: 11 }} width={42} />
                        <Tooltip
                          labelFormatter={(d) => dateShort(String(d))}
                          formatter={(value) => [money(Number(value ?? 0)), 'Ingresos']}
                        />
                        <Bar dataKey="revenue" name="Ingresos" fill="#20c997" radius={[2, 2, 0, 0]} />
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
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={summary.daily} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={(d: string) => dateShort(d).slice(0, 5)} tick={{ fontSize: 11 }} minTickGap={24} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                        <Tooltip labelFormatter={(d) => dateShort(String(d))} />
                        <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="created" name="Creadas" stroke="#0d6efd" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="checkIns" name="Check-ins" stroke="#198754" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="checkOuts" name="Check-outs" stroke="#6f42c1" strokeWidth={2} dot={false} />
                      </LineChart>
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