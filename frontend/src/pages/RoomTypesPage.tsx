import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import type { RoomType } from '../api/types';
import { LoadState } from '../components/Feedback';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useApiError } from '../components/pagination';

export function RoomTypesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { data, loading, error, reload } = useApi<{ data: RoomType[] }>('/room-types');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RoomType | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<RoomType | null>(null);
  const { error: apiError, handleError } = useApiError();

  const items = data?.data ?? [];

  function openCreate() {
    setEditing(null);
    setName('');
    setOpen(true);
  }

  function openEdit(item: RoomType) {
    setEditing(item);
    setName(item.name);
    setOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { name: name.trim() };
      if (editing) await api(`/room-types/${editing.id}`, { method: 'PUT', body });
      else await api('/room-types', { method: 'POST', body });
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
      await api(`/room-types/${deleting.id}`, { method: 'DELETE' });
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
          <h1 className="h4 mb-1">Tipos de habitación</h1>
          <p className="text-secondary mb-0">{items.length} tipos configurados</p>
        </div>
        {isAdmin && (
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            + Nuevo tipo
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
                    <th>Habitaciones</th>
                    {isAdmin && <th className="text-end">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td><strong>{item.name}</strong></td>
                      <td>{item._count?.rooms ?? 0}</td>
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

      <Modal open={open} title={editing ? 'Editar tipo' : 'Nuevo tipo'} onClose={() => setOpen(false)}>
        <form onSubmit={handleSave}>
          <div className="mb-3">
            <label className="form-label">Nombre *</label>
            <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
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
        title="Eliminar tipo"
        message={
          <>
            <p>¿Eliminar el tipo <strong>{deleting?.name}</strong>?</p>
            <p className="text-secondary mb-0">Solo si no tiene habitaciones asignadas.</p>
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