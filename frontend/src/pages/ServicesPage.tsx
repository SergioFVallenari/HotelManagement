import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import type { Service } from '../api/types';
import { LoadState } from '../components/Feedback';
import { ActiveBadge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useApiError } from '../components/pagination';
import { money } from '../lib/format';

interface ServiceForm {
  name: string;
  price: number;
  isActive: boolean;
}

export function ServicesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { data, loading, error, reload } = useApi<{ data: Service[] }>('/services');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState<ServiceForm>({ name: '', price: 0, isActive: true });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Service | null>(null);
  const { error: apiError, handleError } = useApiError();

  const items = data?.data ?? [];

  function openCreate() {
    setEditing(null);
    setForm({ name: '', price: 0, isActive: true });
    setOpen(true);
  }

  function openEdit(item: Service) {
    setEditing(item);
    setForm({ name: item.name, price: item.price, isActive: item.isActive });
    setOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { name: form.name.trim(), price: Number(form.price), isActive: form.isActive };
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
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
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

      {apiError && <LoadState loading={false} error={apiError} />}

      <div className="card shadow-sm">
        <div className="card-body p-0">
          <LoadState loading={loading} error={error} onRetry={reload} empty={items.length === 0} />
          {items.length > 0 && (
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nombre</th>
                    <th>Precio</th>
                    <th>Estado</th>
                    {isAdmin && <th className="text-end">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td><strong>{item.name}</strong></td>
                      <td>{money(item.price)}</td>
                      <td><ActiveBadge active={item.isActive} activeLabel="Activo" inactiveLabel="Inactivo" /></td>
                      {isAdmin && (
                        <td className="text-end">
                          <div className="d-inline-flex gap-1">
                            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => openEdit(item)}>
                              Editar
                            </button>
                            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setDeleting(item)}>
                              Eliminar
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal open={open} title={editing ? `Editar ${editing.name}` : 'Nuevo servicio'} onClose={() => setOpen(false)}>
        <form onSubmit={handleSave}>
          <div className="mb-3">
            <label className="form-label">Nombre *</label>
            <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
          </div>
          <div className="mb-3">
            <label className="form-label">Precio *</label>
            <input type="number" min={0} step="0.01" className="form-control" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} required />
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
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}