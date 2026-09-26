import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api, buildQuery } from '../api/client';
import { useApi } from '../api/useApi';
import type { Page, Room, RoomType } from '../api/types';
import { ActiveBadge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useApiError } from '../components/pagination';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { dateShort, money, today, addDays } from '../lib/format';

const ROOMS_COLUMNS: Column<Room>[] = [
  { header: 'N°', render: (r) => <strong>{r.number}</strong> },
  { header: 'Nombre', render: (r) => r.name ?? '—' },
  { header: 'Tipo', render: (r) => r.type?.name ?? r.typeId },
  { header: 'Cap.', render: (r) => r.capacity },
  { header: 'Camas extra máx.', render: (r) => r.maxExtraBeds },
  { header: 'Precio/noche', render: (r) => money(r.price) },
  { header: 'Amenities', className: 'text-secondary', render: (r) => (r.amenities.length ? r.amenities.join(' · ') : '—') },
  { header: 'Estado', render: (r) => <ActiveBadge active={r.isActive} /> },
  { header: 'Reservas', render: (r) => r._count?.reservations ?? 0 },
];

interface RoomForm {
  id?: number;
  number: string;
  name: string;
  typeId: number;
  capacity: number;
  maxExtraBeds: number;
  price: number;
  amenities: string;
  isActive: boolean;
}

const emptyForm: RoomForm = { number: '', name: '', typeId: 0, capacity: 2, maxExtraBeds: 0, price: 0, amenities: '', isActive: true };

export function RoomsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<Page<Room>>(`/rooms${buildQuery({ page, pageSize: 15, search: query })}`);
  const typesApi = useApi<{ data: RoomType[] }>('/room-types');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [form, setForm] = useState<RoomForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Room | null>(null);
  const { error: apiError, handleError, clearError } = useApiError();

  const [availOpen, setAvailOpen] = useState(false);
  const [availDates, setAvailDates] = useState({ checkIn: addDays(today(), 1), checkOut: addDays(today(), 2) });
  const [availTypeId, setAvailTypeId] = useState('');
  const [availResult, setAvailResult] = useState<Room[] | null>(null);
  const [availError, setAvailError] = useState<string | null>(null);
  const [availLoading, setAvailLoading] = useState(false);

  const types = typesApi.data?.data ?? [];

  function applySearch(newSearch: string) {
    setSearch(newSearch);
    setPage(1);
    setQuery(newSearch);
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, typeId: types[0]?.id ?? 0, price: 0 });
    clearError();
    setFormOpen(true);
  }

  function openEdit(room: Room) {
    setEditing(room);
    setForm({
      id: room.id,
      number: room.number,
      name: room.name ?? '',
      typeId: room.typeId,
      capacity: room.capacity,
      maxExtraBeds: room.maxExtraBeds,
      price: room.price,
      amenities: room.amenities.join(', '),
      isActive: room.isActive,
    });
    clearError();
    setFormOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!form.typeId) {
      handleError(new Error('Seleccioná un tipo de habitación'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        number: form.number.trim(),
        name: form.name.trim() || null,
        typeId: Number(form.typeId),
        capacity: Number(form.capacity),
        maxExtraBeds: Number(form.maxExtraBeds),
        price: Number(form.price),
        amenities: form.amenities.split(',').map((a) => a.trim()).filter(Boolean),
        isActive: form.isActive,
      };
      if (editing) {
        await api(`/rooms/${editing.id}`, { method: 'PUT', body: payload });
      } else {
        await api('/rooms', { method: 'POST', body: payload });
      }
      setFormOpen(false);
      reload();
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setSaving(true);
    try {
      await api(`/rooms/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      reload();
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  async function checkAvailability() {
    setAvailLoading(true);
    setAvailError(null);
    setAvailResult(null);
    try {
      const result = await api<{ data: Room[] }>(
        `/rooms/available${buildQuery({ checkIn: availDates.checkIn, checkOut: availDates.checkOut, typeId: availTypeId || undefined })}`,
      );
      setAvailResult(result.data);
    } catch (err) {
      setAvailError((err as Error).message);
    } finally {
      setAvailLoading(false);
    }
  }

  const rooms = data?.data ?? [];

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="h4 mb-1">Habitaciones</h1>
          <p className="text-secondary mb-0">{data?.meta.total ?? 0} habitaciones registradas</p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <input
            placeholder="Buscar por número o nombre…"
            className="form-control"
            style={{ width: 220 }}
            value={search}
            onChange={(e) => applySearch(e.target.value)}
          />
          <button type="button" className={`btn ${availOpen ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setAvailOpen((v) => !v)}>
            Disponibilidad
          </button>
          {isAdmin && (
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              + Nueva habitación
            </button>
          )}
        </div>
      </div>

      {availOpen && (
        <div className="card shadow-sm mb-4">
          <div className="card-body">
            <h3 className="h6 mb-3">Consultar disponibilidad por rango</h3>
            <div className="filter-row">
              <div className="input-group mb-0" style={{ width: 'auto', flex: '0 1 auto' }}>
                <span className="input-group-text">Check-in</span>
                <input type="date" className="form-control" value={availDates.checkIn} onChange={(e) => setAvailDates({ ...availDates, checkIn: e.target.value })} />
              </div>
              <div className="input-group mb-0" style={{ width: 'auto', flex: '0 1 auto' }}>
                <span className="input-group-text">Check-out</span>
                <input type="date" className="form-control" value={availDates.checkOut} onChange={(e) => setAvailDates({ ...availDates, checkOut: e.target.value })} />
              </div>
              <div className="input-group mb-0" style={{ width: 'auto', flex: '0 1 auto' }}>
                <span className="input-group-text">Tipo</span>
                <select className="form-select" value={availTypeId} onChange={(e) => setAvailTypeId(e.target.value)}>
                  <option value="">Todos</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn btn-primary" onClick={checkAvailability} disabled={availLoading}>
                {availLoading ? 'Buscando…' : 'Consultar'}
              </button>
            </div>
            {availError && <p className="text-danger fw-medium mt-3 mb-0">{availError}</p>}
            {availResult && (
              <p className="text-success fw-medium mt-3 mb-0">
                {availResult.length} habitación(es) disponible(s) del {dateShort(availDates.checkIn)} al {dateShort(availDates.checkOut)}
              </p>
            )}
            {availResult && (
              <table className="table table-sm align-middle mt-3 mb-0">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Tipo</th>
                    <th>Cap.</th>
                    <th>Precio</th>
                    <th>Amenities</th>
                  </tr>
                </thead>
                <tbody>
                  {availResult.map((room) => (
                    <tr key={room.id}>
                      <td>{room.number}</td>
                      <td>{room.type?.name}</td>
                      <td>{room.capacity}</td>
                      <td>{money(room.price)}</td>
                      <td className="text-secondary">{room.amenities.join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <DataTable<Room>
        columns={ROOMS_COLUMNS}
        rows={rooms}
        keyField="id"
        loading={loading}
        error={error}
        onRetry={reload}
        meta={data?.meta}
        onPageChange={setPage}
        actions={
          isAdmin
            ? (room) => (
              <div className="d-inline-flex gap-1">
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => openEdit(room)}>
                  Editar
                </button>
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => { clearError(); setDeleting(room); }}>
                  Eliminar
                </button>
              </div>
            )
            : undefined
        }
      />

      <Modal
        open={formOpen}
        title={editing ? `Editar habitación ${editing.number}` : 'Nueva habitación'}
        onClose={() => {
          setFormOpen(false);
          clearError();
        }}
        error={apiError}
        onDismissError={clearError}
      >
        <form onSubmit={handleSave}>
          <div className="row g-3">
            <div className="col-sm-6">
              <label className="form-label">Número *</label>
              <input className="form-control" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} required />
            </div>
            <div className="col-sm-6">
              <label className="form-label">Nombre</label>
              <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Opcional" />
            </div>
            <div className="col-sm-6">
              <label className="form-label">Tipo *</label>
              <select className="form-select" value={form.typeId} onChange={(e) => setForm({ ...form, typeId: Number(e.target.value) })} required>
                <option value={0}>— Seleccionar —</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-sm-6">
              <label className="form-label">Capacidad *</label>
              <input type="number" min={1} className="form-control" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} required />
            </div>
            <div className="col-sm-6">
              <label className="form-label">Máx. camas extras</label>
              <input type="number" min={0} max={10} className="form-control" value={form.maxExtraBeds} onChange={(e) => setForm({ ...form, maxExtraBeds: Number(e.target.value) })} />
              <div className="form-text">0 = no se ofrecen camas extra en esta habitación.</div>
            </div>
            <div className="col-sm-6">
              <label className="form-label">Precio por noche *</label>
              <input type="number" min={0} step="0.01" className="form-control" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} required />
            </div>
            <div className="col-12">
              <label className="form-label">Amenities (separadas por coma)</label>
              <input className="form-control" value={form.amenities} onChange={(e) => setForm({ ...form, amenities: e.target.value })} placeholder="WiFi, TV, Aire acondicionado" />
            </div>
            <div className="col-12">
              <div className="form-check">
                <input id="room-active" className="form-check-input" type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                <label className="form-check-label" htmlFor="room-active">Habitación activa (visible para reservas)</label>
              </div>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-outline-secondary" onClick={() => setFormOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear habitación'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Eliminar habitación"
        message={
          <>
            <p>¿Eliminar la habitación <strong>{deleting?.number}</strong>?</p>
            <p className="text-secondary mb-0">Solo es posible si no tiene reservas activas.</p>
          </>
        }
        confirmLabel="Eliminar"
        danger
        busy={saving}
        error={apiError}
        onCancel={() => {
          setDeleting(null);
          clearError();
        }}
        onConfirm={handleDelete}
      />
    </div>
  );
}