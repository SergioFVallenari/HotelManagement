import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import type { RoomType } from '../api/types';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DataTable } from '../components/DataTable';
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
  const { error: apiError, handleError, clearError } = useApiError();

  const items = data?.data ?? [];

  function openCreate() {
    setEditing(null);
    setName('');
    clearError();
    setOpen(true);
  }

  function openEdit(item: RoomType) {
    setEditing(item);
    setName(item.name);
    clearError();
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

      <DataTable<RoomType>
        columns={[
          { header: 'ID', render: (i) => i.id },
          { header: 'Nombre', render: (i) => <strong>{i.name}</strong> },
          { header: 'Habitaciones', render: (i) => i._count?.rooms ?? 0 },
        ]}
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
        title={editing ? 'Editar tipo' : 'Nuevo tipo'}
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