import { useState } from 'react';
import type { FormEvent } from 'react';
import { IconBuildingSkyscraper, IconCheck } from '@tabler/icons-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import type { Company } from '../api/types';
import { Modal } from '../components/Modal';
import { ErrorBanner } from '../components/Feedback';
import { useApiError } from '../components/pagination';

interface CompanyForm {
  name: string;
}

const EMPTY_FORM: CompanyForm = { name: '' };

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Propietario',
  ADMIN: 'Administrador',
  RECEPCIONISTA: 'Recepción',
};

export function ProfilePage() {
  const { user, switchCompany } = useAuth();
  const { data, loading, error, reload } = useApi<{ data: Company[] }>('/companies/owned');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const { error: apiError, handleError, clearError } = useApiError();

  const items = data?.data ?? [];
  const isOwner = user?.role === 'OWNER';

  async function handleSwitch(companyId: number) {
    setBusyId(companyId);
    setSwitchError(null);
    try {
      await switchCompany(companyId);
    } catch (err) {
      setSwitchError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    clearError();
    setOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/companies', {
        method: 'POST',
        body: { name: form.name.trim() },
      });
      setOpen(false);
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
          <h1 className="h4 mb-1">Mi perfil</h1>
          <p className="text-secondary mb-0">Tus datos y, si sos propietario, tus hoteles.</p>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-4">
              <div className="text-secondary small text-uppercase">Usuario</div>
              <div className="fw-semibold">{user?.username}</div>
            </div>
            <div className="col-md-4">
              <div className="text-secondary small text-uppercase">Rol</div>
              <div className="fw-semibold">{user ? ROLE_LABEL[user.role] : ''}</div>
            </div>
            <div className="col-md-4">
              <div className="text-secondary small text-uppercase">Nombre</div>
              <div className="fw-semibold">{user?.name ?? '—'}</div>
            </div>
            <div className="col-md-4">
              <div className="text-secondary small text-uppercase">Email</div>
              <div className="fw-semibold">{user?.email ?? '—'}</div>
            </div>
          </div>
        </div>
      </div>

      {isOwner && (
        <div>
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-3">
            <div>
              <h2 className="h5 mb-1">Mis hoteles</h2>
              <p className="text-secondary mb-0">{items.length} hoteles que creaste</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              + Nuevo hotel
            </button>
          </div>

          {switchError && <ErrorBanner message={switchError} onDismiss={() => setSwitchError(null)} />}

          {loading && <div className="p-4 text-center text-secondary">Cargando hoteles…</div>}
          {error && !loading && (
            <div className="p-4">
              <ErrorBanner message={error} onDismiss={reload} />
            </div>
          )}
          {!loading && !error && items.length === 0 && (
            <div className="p-4 text-center text-secondary">Todavía no creaste ningún hotel.</div>
          )}
          {!loading && !error && items.length > 0 && (
            <div className="d-grid gap-2">
              {items.map((c) => {
                const active = c.id === user?.companyId;
                return (
                  <div
                    key={c.id}
                    className={`company-picker-card d-flex align-items-center justify-content-between gap-2 ${
                      active ? 'active' : ''
                    }`}
                  >
                    <div className="d-flex align-items-center gap-2">
                      <IconBuildingSkyscraper size={18} className="text-secondary" />
                      <div>
                        <strong>{c.name}</strong>
                        <div className="small text-secondary">
                          {active ? `Hotel actual · N° ${c.id}` : `ID ${c.id}`}
                        </div>
                      </div>
                    </div>
                    {active ? (
                      <button type="button" className="btn btn-sm btn-outline-secondary" disabled>
                        <IconCheck size={16} className="me-1" />
                        Actual
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={busyId !== null}
                        onClick={() => handleSwitch(c.id)}
                      >
                        {busyId === c.id ? 'Cambiando…' : 'Cambiar a este hotel'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Modal
        open={open}
        title="Nuevo hotel"
        onClose={() => {
          setOpen(false);
          clearError();
        }}
        error={apiError}
        onDismissError={clearError}
      >
        <form onSubmit={handleSave}>
          <div className="mb-3">
            <label className="form-label" htmlFor="company-name">
              Nombre del hotel *
            </label>
            <input
              id="company-name"
              className="form-control"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </div>
          <hr />
          <div className="modal-actions">
            <button type="button" className="btn btn-outline-secondary" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creando…' : 'Crear hotel'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}