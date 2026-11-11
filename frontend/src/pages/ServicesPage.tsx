import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import type { Service } from '../api/types';
import { ActiveBadge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { useApiError } from '../components/pagination';
import { money, CHARGE_TYPES } from '../lib/format';
import type { ServiceChargeType } from '../api/types';

const SERVICES_COLUMNS: Column<Service>[] = [
  { header: 'Nombre', render: (s) => <><strong>{s.name}</strong>{s.description && <div className="small text-secondary text-break" style={{ whiteSpace: 'pre-line' }}>{s.description}</div>}</> },
  { header: 'Precio', render: (s) => money(s.price) },
  { header: 'Tipo de cobro', render: (s) => <>{CHARGE_TYPES[s.chargeType] ?? s.chargeType}{s.chargeType === 'PER_ROOM_INTERVAL' && <div className="small text-secondary">Cada {s.intervalDays} día(s), sin incluir el día de salida</div>}</> },
  {
    header: 'Cama extra',
    render: (s) =>
      s.isExtraBed ? <span className="badge text-bg-warning rounded-pill px-2 py-1">Cama extra</span> : '—',
  },
  { header: 'Estado', render: (s) => <ActiveBadge active={s.isActive} activeLabel="Activo" inactiveLabel="Inactivo" /> },
];

interface ServiceForm {
  name: string;
  description: string;
  intervalDays: number;
  price: number;
  chargeType: ServiceChargeType;
  isExtraBed: boolean;
  isActive: boolean;
}

export function ServicesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'OWNER';
  const { data, loading, error, reload } = useApi<{ data: Service[] }>('/services');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState<ServiceForm>({ name: '', description: '', intervalDays: 3, price: 0, chargeType: 'PACK', isExtraBed: false, isActive: true });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Service | null>(null);
  const { error: apiError, handleError, clearError } = useApiError();

  const items = data?.data ?? [];

  function openCreate() {
    setEditing(null);
    setForm({ name: '', description: '', intervalDays: 3, price: 0, chargeType: 'PACK', isExtraBed: false, isActive: true });
    clearError();
    setOpen(true);
  }

  function openEdit(item: Service) {
    setEditing(item);
    setForm({ name: item.name, description: item.description ?? '', intervalDays: item.intervalDays ?? 3, price: item.price, chargeType: item.chargeType, isExtraBed: item.isExtraBed, isActive: item.isActive });
    clearError();
    setOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { name: form.name.trim(), description: form.description.trim() || null, intervalDays: form.chargeType === 'PER_ROOM_INTERVAL' ? form.intervalDays : null, price: Number(form.price), chargeType: form.chargeType, isExtraBed: form.isExtraBed, isActive: form.isActive };
      if (editing) await api(`/services/${editing.id}`, { method: 'PUT', body });
      else await api('/services', { method: 'POST', body });
      setOpen(false);
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
      await api(`/services/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      reload();
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header mb-4">
        <div>
          <h1 className="h4 mb-1">Servicios adicionales</h1>
          <p className="text-secondary mb-0">{items.length} servicios configurados (desayuno, parking, etc.)</p>
        </div>
        {isAdmin && (
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            + Nuevo servicio
          </button>
        )}
      </div>

      <DataTable<Service>
        columns={SERVICES_COLUMNS}
        rows={items}
        keyField="id"
        loading={loading}
        error={error}
        onRetry={reload}
        actions={
          isAdmin
            ? (item) => (
                <div className="d-inline-flex gap-1">
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => openEdit(item)}>
                    Editar
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => { clearError(); setDeleting(item); }}>
                    Eliminar
                  </button>
                </div>
              )
            : undefined
        }
      />

      <Modal
        open={open}
        title={editing ? `Editar ${editing.name}` : 'Nuevo servicio'}
        onClose={() => {
          setOpen(false);
          clearError();
        }}
        error={apiError}
        onDismissError={clearError}
      >
        <form onSubmit={handleSave}>
          <div className="mb-3">
            <label className="form-label">Nombre *</label>
            <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="service-description">Descripción de lo que incluye</label>
            <textarea id="service-description" className="form-control" rows={3} maxLength={1000} value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Ej.: una sesión de spa de 60 minutos para una persona. Requiere coordinar horario." />
            <div className="form-text">Opcional · {form.description.length}/1000 caracteres. Explicá inclusiones y condiciones; el importe se calcula con el tipo de cobro y la frecuencia configurados.</div>
          </div>
          <div className="mb-3">
            <label className="form-label">Precio *</label>
            <input type="number" min={0} step="0.01" className="form-control" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} required />
          </div>
          <div className="mb-3">
            <label className="form-label">Tipo de cobro *</label>
            <select
              className="form-select"
              value={form.chargeType}
              onChange={(e) => setForm({ ...form, chargeType: e.target.value as ServiceChargeType, isExtraBed: e.target.value === 'PER_ROOM_INTERVAL' ? false : form.isExtraBed })}
            >
              {Object.entries(CHARGE_TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <div className="form-text">
              Por persona: huéspedes × noches · Por día: se cobra por noche · Pack: cargo fijo por cantidad elegida · Por habitación e intervención: frecuencia automática durante la estadía. El texto de la descripción no modifica el cálculo.
            </div>
          </div>
          {form.chargeType === 'PER_ROOM_INTERVAL' && <div className="mb-3">
            <label className="form-label" htmlFor="service-interval">Realizar cada cuántos días *</label>
            <input id="service-interval" className="form-control" type="number" min={1} max={365} step={1} required value={form.intervalDays || ''}
              onChange={(event) => setForm({ ...form, intervalDays: Number(event.target.value) })} />
            <div className="form-text">Precio por habitación y por intervención. No incluye la llegada ni la salida. Ej.: cada 3 días en 10 noches → 3 intervenciones por habitación (días 3, 6 y 9).</div>
          </div>}
          <div className="form-check mb-3">
            <input
              id="service-extra-bed"
              className="form-check-input"
              type="checkbox"
              checked={form.isExtraBed}
              onChange={(e) => setForm({ ...form, isExtraBed: e.target.checked, chargeType: e.target.checked ? 'PER_DAY' : form.chargeType })}
            />
            <label className="form-check-label" htmlFor="service-extra-bed">
              Es una cama extra (se cobra por día)
            </label>
          </div>
          <div className="form-check mb-3">
            <input id="service-active" className="form-check-input" type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            <label className="form-check-label" htmlFor="service-active">Activo</label>
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

      <ConfirmDialog
        open={!!deleting}
        title="Eliminar servicio"
        message={
          <>
            <p>¿Eliminar el servicio <strong>{deleting?.name}</strong>?</p>
            <p className="text-secondary mb-0">Solo si no fue usado en reservas.</p>
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
