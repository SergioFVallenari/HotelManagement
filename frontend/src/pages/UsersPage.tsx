import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { useApi, useLazyApi } from '../api/useApi';
import type { Company, UserListItem, UserRole } from '../api/types';
import { ActiveBadge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { useApiError } from '../components/pagination';
import { dateShort } from '../lib/format';

const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Propietario',
  ADMIN: 'Administrador',
  RECEPCIONISTA: 'Recepción',
};

const BASE_COLUMNS: Column<UserListItem>[] = [
  { header: 'Usuario', render: (u) => <strong>{u.username}</strong> },
  { header: 'Nombre', render: (u) => u.name || '—' },
  { header: 'Email', render: (u) => u.email || '—' },
  {
    header: 'Rol',
    render: (u) => (
      <span className={`badge rounded-pill px-2 py-1 ${u.role === 'RECEPCIONISTA' ? 'text-bg-secondary' : 'text-bg-primary'}`}>
        {ROLE_LABELS[u.role] ?? u.role}
      </span>
    ),
  },
  { header: 'Estado', render: (u) => <ActiveBadge active={u.isActive} activeLabel="Activo" inactiveLabel="Inactivo" /> },
  { header: 'Alta', render: (u) => dateShort(u.createdAt) },
];

const OWNER_COLUMNS: Column<UserListItem>[] = [
  ...BASE_COLUMNS.slice(0, 4),
  { header: 'Hotel', render: (u) => u.companyName || '—' },
  ...BASE_COLUMNS.slice(4),
];

interface UserForm {
  name: string;
  username: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'RECEPCIONISTA';
  companyId: number | null;
  isActive: boolean;
}

const EMPTY_FORM: UserForm = {
  name: '',
  username: '',
  email: '',
  password: '',
  role: 'RECEPCIONISTA',
  companyId: null,
  isActive: true,
};

export function UsersPage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const isAllowed = isOwner || user?.role === 'ADMIN';
  const { data, loading, error, reload } = useApi<{ data: UserListItem[] }>('/users');
  const { data: ownedData, run: loadOwned } = useLazyApi<{ data: Company[] }>();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const { error: apiError, handleError, clearError } = useApiError();

  const items = data?.data ?? [];
  const ownedCompanies = ownedData?.data ?? [];

  function openCreate() {
    setForm(EMPTY_FORM);
    clearError();
    setOpen(true);
    if (isOwner) loadOwned('/companies/owned').catch(() => {});
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/users', {
        method: 'POST',
        body: {
          username: form.username.trim(),
          password: form.password,
          email: form.email.trim(),
          role: form.role,
          isActive: form.isActive,
          ...(form.name.trim() ? { name: form.name.trim() } : {}),
          ...(isOwner && form.companyId ? { companyId: form.companyId } : {}),
        },
      });
      setOpen(false);
      reload();
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  if (!isAllowed) {
    return (
      <div className="text-center text-secondary py-5">
        Solo el propietario o un administrador puede gestionar usuarios.
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="h4 mb-1">Usuarios</h1>
          <p className="text-secondary mb-0">
            {items.length} {isOwner ? 'usuarios que creaste' : 'usuarios de tu hotel'}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          + Nuevo usuario
        </button>
      </div>

      <DataTable<UserListItem>
        columns={isOwner ? OWNER_COLUMNS : BASE_COLUMNS}
        rows={items}
        keyField="id"
        loading={loading}
        error={error}
        onRetry={reload}
      />

      <Modal
        open={open}
        title="Nuevo usuario"
        onClose={() => {
          setOpen(false);
          clearError();
        }}
        error={apiError}
        onDismissError={clearError}
      >
        <form onSubmit={handleSave}>
          {isOwner && (
            <div className="mb-3">
              <label className="form-label" htmlFor="user-company">Hotel *</label>
              <select
                id="user-company"
                className="form-select"
                value={form.companyId ?? ''}
                onChange={(e) => setForm({ ...form, companyId: e.target.value ? Number(e.target.value) : null })}
                required
              >
                <option value="" disabled>
                  {ownedCompanies.length ? 'Elegí un hotel…' : 'Cargando hoteles…'}
                </option>
                {ownedCompanies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="mb-3">
            <label className="form-label" htmlFor="user-username">Usuario *</label>
            <input id="user-username" className="form-control" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required autoFocus />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="user-name">Nombre</label>
            <input id="user-name" className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="user-email">Email *</label>
            <input id="user-email" className="form-control" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <div className="form-text">Es el email con el que el usuario inicia sesión.</div>
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="user-password">Contraseña *</label>
            <input id="user-password" className="form-control" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <div className="form-text">Mínimo 6 caracteres. Se ignora si el email ya tiene una cuenta.</div>
          </div>
          <div className="mb-3">
            {isOwner ? (
              <>
                <label className="form-label" htmlFor="user-role">Rol *</label>
                <select id="user-role" className="form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserForm['role'] })}>
                  <option value="RECEPCIONISTA">Recepción</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </>
            ) : (
              <>
                <label className="form-label">Rol *</label>
                <input className="form-control" value="Recepción" disabled />
              </>
            )}
          </div>
          <div className="form-check mb-3">
            <input id="user-active" className="form-check-input" type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            <label className="form-check-label" htmlFor="user-active">Activo</label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-outline-secondary" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creando…' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
