import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, buildQuery } from '../api/client';
import { useApi } from '../api/useApi';
import type { Guest, Page, Reservation } from '../api/types';
import { LoadState } from '../components/Feedback';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/Badge';
import { useApiError, PaginationBar } from '../components/pagination';
import { dateShort, money } from '../lib/format';

interface GuestForm {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

interface GuestDetail extends Guest {
  reservations: Reservation[];
}

export function GuestsPage() {
  const [search, setSearch] = useState('');
  const [appliedQuery, setAppliedQuery] = useState<Record<string, string | undefined>>({});
  const [page, setPage] = useState(1);

  const query = buildQuery({ q: appliedQuery.q, page });
  const { data, loading, error, reload } = useApi<Page<Guest>>(`/guests${query}`);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Guest | null>(null);
  const [form, setForm] = useState<GuestForm>({ firstName: '', lastName: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<GuestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const { error: apiError, handleError } = useApiError();

  const guests = data?.data ?? [];

  function applySearch() {
    setPage(1);
    setAppliedQuery({ q: search.trim() || undefined });
  }

  function openCreate() {
    setEditing(null);
    setForm({ firstName: '', lastName: '', phone: '', email: '' });
    setOpen(true);
  }

  function openEdit(guest: Guest) {
    setEditing(guest);
    setForm({ firstName: guest.firstName, lastName: guest.lastName, phone: guest.phone, email: guest.email });
    setOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim(), email: form.email.trim() };
      if (editing) await api(`/guests/${editing.id}`, { method: 'PUT', body });
      else await api('/guests', { method: 'POST', body });
      setOpen(false);
      reload();
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(id: number) {
    setDetail(null);
    setDetailLoading(true);
    try {
      const result = await api<{ data: GuestDetail }>(`/guests/${id}`);
      setDetail(result.data);
    } catch (err) {
      handleError(err);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="h4 mb-1">Huéspedes</h1>
          <p className="text-secondary mb-0">{data?.meta.total ?? 0} huéspedes registrados</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          + Nuevo huésped
        </button>
      </div>

      <div className="card shadow-sm mb-4">
        <div className="card-body py-3">
          <div className="filter-row">
            <input
              placeholder="Buscar por nombre, apellido, email o teléfono…"
              className="form-control"
              style={{ minWidth: 260, flex: '1 1 auto' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="button" className="btn btn-primary" onClick={applySearch}>
              Buscar
            </button>
          </div>
        </div>
      </div>

      {apiError && <LoadState loading={false} error={apiError} onRetry={reload} />}

      <div className="card shadow-sm">
        <div className="card-body p-0">
          <LoadState loading={loading} error={error} onRetry={reload} empty={guests.length === 0} />
          {guests.length > 0 && (
            <>
              <div className="table-responsive">
                <table className="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Nombre</th>
                      <th>Email</th>
                      <th>Teléfono</th>
                      <th className="text-end">Reservas</th>
                      <th className="text-end">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guests.map((guest) => (
                      <tr key={guest.id}>
                        <td>{guest.id}</td>
                        <td>
                          <strong>
                            {guest.lastName}, {guest.firstName}
                          </strong>
                        </td>
                        <td>{guest.email}</td>
                        <td>{guest.phone}</td>
                        <td className="text-end">{guest._count?.reservations ?? 0}</td>
                        <td className="text-end">
                          <div className="d-inline-flex gap-1">
                            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => openDetail(guest.id)}>
                              Ver
                            </button>
                            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => openEdit(guest)}>
                              Editar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-3 border-top">
                <PaginationBar meta={data?.meta} onChange={setPage} />
              </div>
            </>
          )}
        </div>
      </div>

      <Modal open={open} title={editing ? `Editar ${editing.firstName} ${editing.lastName}` : 'Nuevo huésped'} onClose={() => setOpen(false)}>
        <form onSubmit={handleSave}>
          <div className="row g-3">
            <div className="col-sm-6">
              <label className="form-label">Nombre *</label>
              <input className="form-control" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required autoFocus />
            </div>
            <div className="col-sm-6">
              <label className="form-label">Apellido *</label>
              <input className="form-control" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
            </div>
            <div className="col-sm-6">
              <label className="form-label">Teléfono *</label>
              <input className="form-control" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            </div>
            <div className="col-sm-6">
              <label className="form-label">Email *</label>
              <input type="email" className="form-control" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-outline-secondary" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!detail || detailLoading} title={detail ? `${detail.lastName}, ${detail.firstName}` : 'Huésped'} onClose={() => setDetail(null)} wide>
        {detailLoading && <LoadState loading error={null} />}
        {detail && !detailLoading && (
          <div>
            <div className="row g-4">
              <div className="col-md-4">
                <h3 className="h6">Contacto</h3>
                <dl className="detail-list">
                  <dt>Teléfono</dt>
                  <dd>{detail.phone}</dd>
                  <dt>Email</dt>
                  <dd>{detail.email}</dd>
                </dl>
              </div>
              <div className="col-md-8">
                <h3 className="h6">Reservas</h3>
                {detail.reservations.length === 0 ? (
                  <p className="text-secondary mb-0">Sin reservas registradas.</p>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-sm align-middle mb-0">
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Habitación</th>
                          <th>Período</th>
                          <th className="text-end">Total</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.reservations.map((r) => (
                          <tr key={r.id}>
                            <td><strong>{r.code}</strong></td>
                            <td>{r.room?.number ?? r.roomId}</td>
                            <td>
                              {dateShort(r.checkIn)} → {dateShort(r.checkOut)}
                            </td>
                            <td className="text-end">{money(r.totals?.total ?? 0)}</td>
                            <td><StatusBadge status={r.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => openEdit(detail)}>
                Editar datos
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setDetail(null)}>
                Cerrar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}