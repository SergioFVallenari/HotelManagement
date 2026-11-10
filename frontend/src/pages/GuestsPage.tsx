import { useState } from 'react';
import { guestContactSchema, validateContact } from '../lib/contactValidation';
import { FilterPanel } from '../components/FilterPanel';
import type { FormEvent } from 'react';
import { api, buildQuery } from '../api/client';
import { useApi } from '../api/useApi';
import type { Guest, Page, Reservation } from '../api/types';
import { LoadState } from '../components/Feedback';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/Badge';
import { useApiError } from '../components/pagination';
import { DataTable } from '../components/DataTable';
import { DATA_TABLE_PAGE_SIZE } from '../lib/pagination';
import type { Column } from '../components/DataTable';
import { dateShort, money } from '../lib/format';
import { IconCalendarEvent, IconUser } from '@tabler/icons-react';

const GUESTS_COLUMNS: Column<Guest>[] = [
  {
    header: 'Huésped',
    render: (g) => (
      <div className="guest-identity">
        <span className="guest-avatar" aria-hidden="true">{`${g.firstName.trim().charAt(0)}${g.lastName.trim().charAt(0)}`.toUpperCase()}</span>
        <span><strong>{g.firstName} {g.lastName}</strong><small>Huésped</small></span>
      </div>
    ),
  },
  { header: 'Email', render: (g) => g.email ?? <span className="text-secondary">Sin registrar</span> },
  { header: 'Teléfono', render: (g) => g.phone ?? <span className="text-secondary">Sin registrar</span> },
  { header: 'Reservas', align: 'center', render: (g) => <span className="guest-reservation-count">{g._count?.reservations ?? 0}</span> },
];

const GUEST_DETAIL_RES_COLUMNS: Column<Reservation>[] = [
  { header: 'Código', render: (r) => <strong>{r.code}</strong> },
  { header: 'Habitaciones', render: (r) => r.rooms?.length ? r.rooms.map((line) => line.room?.number ?? '—').join(', ') : r.room?.number ?? '—' },
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

  const query = buildQuery({ q: appliedQuery.q, page, pageSize: DATA_TABLE_PAGE_SIZE });
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
    setForm({ firstName: guest.firstName, lastName: guest.lastName, phone: guest.phone ?? '', email: guest.email ?? '' });
    clearError();
    setOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const contact = validateContact(guestContactSchema, form);
      const body = { firstName: form.firstName.trim(), lastName: form.lastName.trim(), ...contact };
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
    <div className="guests-page">
      <div className="page-header mb-4">
        <div>
          <h1 className="mb-2">Huéspedes</h1>
          <p className="text-secondary mb-0">Administrá los datos y el historial de tus huéspedes.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          + Nuevo huésped
        </button>
      </div>

      {data && <div className="guest-metrics mb-4">
        <div className="card guest-metric"><span className="guest-metric-icon" aria-hidden="true"><IconUser size={19} /></span><span><small>{appliedQuery.q ? 'Huéspedes encontrados' : 'Huéspedes registrados'}</small><strong>{data.meta.total}</strong></span></div>
        <div className="card guest-metric"><span className="guest-metric-icon guest-metric-icon--green" aria-hidden="true"><IconCalendarEvent size={19} /></span><span><small>Reservas vinculadas · página</small><strong>{guests.reduce((total, guest) => total + (guest._count?.reservations ?? 0), 0)}</strong></span></div>
      </div>}

      <FilterPanel onApply={applySearch} activeCount={appliedQuery.q ? 1 : 0}>
            <input
              placeholder="Buscar por nombre, apellido, email o teléfono…"
              className="form-control filter-search"
              aria-label="Buscar huéspedes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" className="btn btn-primary">
              Buscar
            </button>
      </FilterPanel>

      <DataTable<Guest>
        className="guests-table"
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
            <button type="button" className="btn btn-sm btn-outline-secondary guest-action" onClick={() => openDetail(guest.id)}>
              Ver
            </button>
            <button type="button" className="btn btn-sm btn-outline-primary guest-action" onClick={() => openEdit(guest)}>
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
              <label className="form-label">Teléfono (opcional)</label>
              <input type="tel" className="form-control" minLength={3} maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="col-sm-6">
              <label className="form-label">Email (opcional)</label>
              <input type="email" className="form-control" maxLength={200} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
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
                  <dd>{detail.phone ?? '—'}</dd>
                  <dt>Email</dt>
                  <dd>{detail.email ?? '—'}</dd>
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
