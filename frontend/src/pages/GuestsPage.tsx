import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, buildQuery } from '../api/client';
import { useApi } from '../api/useApi';
import type { Guest, Page, Reservation } from '../api/types';
import { LoadState } from '../components/Feedback';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/Badge';
import { useApiError } from '../components/pagination';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { dateShort, money } from '../lib/format';

const GUESTS_COLUMNS: Column<Guest>[] = [
  { header: 'ID', render: (g) => g.id },
  {
    header: 'Nombre',
    render: (g) => (
      <strong>
        {g.lastName}, {g.firstName}
      </strong>
    ),
  },
  { header: 'Email', render: (g) => g.email },
  { header: 'Teléfono', render: (g) => g.phone },
  { header: 'Reservas', align: 'end', render: (g) => g._count?.reservations ?? 0 },
];

const GUEST_DETAIL_RES_COLUMNS: Column<Reservation>[] = [
  { header: 'Código', render: (r) => <strong>{r.code}</strong> },
  { header: 'Habitación', render: (r) => r.room?.number ?? r.roomId },
  { header: 'Período', render: (r) => `${dateShort(r.checkIn)} → ${dateShort(r.checkOut)}` },
  { header: 'Total', align: 'end', render: (r) => money(r.totals?.total ?? 0) },
  { header: 'Estado', render: (r) => <StatusBadge status={r.status} /> },
];

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
  const [detailFailed, setDetailFailed] = useState(false);
  const { error: apiError, handleError, clearError } = useApiError();

  const guests = data?.data ?? [];

  function applySearch() {
    setPage(1);
    setAppliedQuery({ q: search.trim() || undefined });
  }

  function openCreate() {
    setEditing(null);
    setForm({ firstName: '', lastName: '', phone: '', email: '' });
    clearError();
    setOpen(true);
  }

  function openEdit(guest: Guest) {
    setEditing(guest);
    setForm({ firstName: guest.firstName, lastName: guest.lastName, phone: guest.phone, email: guest.email });
    clearError();
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
    clearError();
    setDetail(null);
    setDetailFailed(false);
    setDetailLoading(true);
    try {
      const result = await api<{ data: GuestDetail }>(`/guests/${id}`);
      setDetail(result.data);
    } catch (err) {
      handleError(err);
      setDetailFailed(true);
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

      <DataTable<Guest>
        columns={GUESTS_COLUMNS}
        rows={guests}
        keyField="id"
        loading={loading}
        error={error}
        onRetry={reload}
        meta={data?.meta}
        onPageChange={setPage}
        actions={(guest) => (
          <div className="d-inline-flex gap-1">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => openDetail(guest.id)}>
              Ver
            </button>
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => openEdit(guest)}>
              Editar
            </button>
          </div>
        )}
      />

      <Modal
        open={open}
        title={editing ? `Editar ${editing.firstName} ${editing.lastName}` : 'Nuevo huésped'}
        onClose={() => {
          setOpen(false);
          clearError();
        }}
        error={apiError}
        onDismissError={clearError}
      >
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

      <Modal
        open={!!detail || detailLoading || detailFailed}
        title={detail ? `${detail.lastName}, ${detail.firstName}` : 'Huésped'}
        onClose={() => {
          setDetail(null);
          clearError();
        }}
        error={apiError}
        onDismissError={clearError}
        wide
      >
        {detailLoading && <LoadState loading error={null} />}
        {detailFailed && !detailLoading && (
          <div>
            <p className="text-secondary mb-0">No se pudo cargar el detalle del huésped.</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline-secondary" onClick={() => { setDetail(null); clearError(); }}>
                Cerrar
              </button>
            </div>
          </div>
        )}
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
                  <DataTable<Reservation>
                    columns={GUEST_DETAIL_RES_COLUMNS}
                    rows={detail.reservations}
                    keyField="id"
                    size="sm"
                    variant="bare"
                  />
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => openEdit(detail)}>
                Editar datos
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={() => { setDetail(null); clearError(); }}>
                Cerrar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}