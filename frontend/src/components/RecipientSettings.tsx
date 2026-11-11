import { useState } from 'react';
import { emailSchema, validateContact } from '../lib/contactValidation';
import type { FormEvent } from 'react';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import type { NotificationRecipient } from '../api/types';
import { ConfirmDialog } from './ConfirmDialog';
import { DataTable } from './DataTable';
import { ErrorBanner, Toast } from './Feedback';
import { Modal } from './Modal';

const EMPTY_RECIPIENT = { name: '', email: '', enabled: true };

export function RecipientSettings() {
  const { data, loading, error, reload, refresh } = useApi<{ data: NotificationRecipient[] }>('/recipients');
  const [draft, setDraft] = useState(EMPTY_RECIPIENT);
  const [editing, setEditing] = useState<NotificationRecipient | null>(null);
  const [deleting, setDeleting] = useState<NotificationRecipient | null>(null);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const recipients = data?.data ?? [];
  const activeCount = recipients.filter((recipient) => recipient.enabled).length;

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setApiError(null);
    try {
      const email = validateContact(emailSchema, draft.email);
      await api('/recipients', { method: 'POST', body: { ...draft, email } });
      setDraft(EMPTY_RECIPIENT);
      await refresh();
      setToast('Destinatario agregado.');
    } catch (err) {
      setApiError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(recipient: NotificationRecipient) {
    setSaving(true);
    setApiError(null);
    try {
      await api(`/recipients/${recipient.id}`, { method: 'PATCH', body: { enabled: !recipient.enabled } });
      await refresh();
      setToast(recipient.enabled ? 'Destinatario desactivado.' : 'Destinatario activado.');
    } catch (err) {
      setApiError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setApiError(null);
    try {
      const email = validateContact(emailSchema, editing.email);
      await api(`/recipients/${editing.id}`, { method: 'PATCH', body: { name: editing.name, email, enabled: editing.enabled } });
      await refresh();
      setEditing(null);
      setToast('Destinatario actualizado.');
    } catch (err) {
      setApiError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setSaving(true);
    setApiError(null);
    try {
      await api(`/recipients/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      await refresh();
      setToast('Destinatario eliminado.');
    } catch (err) {
      setApiError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h2 className="h5 mb-1">Destinatarios de notificaciones</h2>
      <p className="text-secondary mb-3">Cargá los emails del hotel y activá o desactivá cada destinatario sin eliminar sus datos.</p>
      {apiError && !editing && !deleting && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <h3 className="h6 mb-3">Agregar destinatario</h3>
          <form onSubmit={create}>
            <fieldset disabled={saving || loading}>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor="recipient-name">Nombre</label>
                  <input id="recipient-name" className="form-control" required maxLength={255} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Recepción, administración…" />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="recipient-email">Email</label>
                  <input id="recipient-email" className="form-control" type="email" required maxLength={254} autoCapitalize="none" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="recepcion@hotel.com" />
                </div>
              </div>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mt-3">
                <div className="form-check form-switch mb-0">
                  <input id="recipient-enabled" className="form-check-input" type="checkbox" role="switch" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
                  <label className="form-check-label" htmlFor="recipient-enabled">Activar al agregar</label>
                </div>
                <button type="submit" className="btn btn-primary">Agregar destinatario</button>
              </div>
            </fieldset>
          </form>
        </div>
      </div>

      <div className="mb-3">
        <span className="text-secondary">{recipients.length} destinatario(s) · {activeCount} activo(s)</span>
        {!loading && !error && activeCount === 0 && <p className="text-secondary small mt-1 mb-0">No hay destinatarios activos. Agregá un email o activá uno de los existentes para dejarlo disponible para los avisos.</p>}
      </div>
      <DataTable<NotificationRecipient>
        rows={recipients}
        keyField="id"
        loading={loading}
        error={error}
        onRetry={reload}
        columns={[
          { header: 'Nombre', render: (recipient) => <strong>{recipient.name}</strong> },
          { header: 'Email', className: 'text-break', render: (recipient) => recipient.email },
          { header: 'Notificaciones', render: (recipient) => (
            <div className="form-check form-switch mb-0">
              <input id={`recipient-switch-${recipient.id}`} className="form-check-input" type="checkbox" role="switch" checked={recipient.enabled} disabled={saving || loading} onChange={() => { void toggle(recipient); }} aria-label={`Notificaciones para ${recipient.name} (${recipient.email})`} />
              <label className="form-check-label" htmlFor={`recipient-switch-${recipient.id}`}>{recipient.enabled ? 'Activas' : 'Desactivadas'}</label>
            </div>
          ) },
        ]}
        actions={(recipient) => (
          <div className="d-inline-flex gap-2">
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={saving || loading} onClick={() => { setApiError(null); setEditing({ ...recipient }); }}>Editar</button>
            <button type="button" className="btn btn-sm btn-outline-danger" disabled={saving || loading} onClick={() => { setApiError(null); setDeleting(recipient); }}>Eliminar</button>
          </div>
        )}
      />

      <Modal open={editing !== null} title="Editar destinatario" onClose={() => { setEditing(null); setApiError(null); }} error={editing ? apiError : null} onDismissError={() => setApiError(null)} preventClose={saving}>
        {editing && <form onSubmit={save}>
          <fieldset disabled={saving}>
            <div className="mb-3">
              <label className="form-label" htmlFor="edit-recipient-name">Nombre</label>
              <input id="edit-recipient-name" className="form-control" required maxLength={255} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="edit-recipient-email">Email</label>
              <input id="edit-recipient-email" className="form-control" type="email" required maxLength={254} autoCapitalize="none" value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} />
            </div>
            <div className="form-check form-switch">
              <input id="edit-recipient-enabled" className="form-check-input" type="checkbox" role="switch" checked={editing.enabled} onChange={(event) => setEditing({ ...editing, enabled: event.target.checked })} />
              <label className="form-check-label" htmlFor="edit-recipient-enabled">Notificaciones activas</label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline-secondary" onClick={() => { setEditing(null); setApiError(null); }}>Cancelar</button>
              <button type="submit" className="btn btn-primary">{saving ? 'Guardando…' : 'Guardar cambios'}</button>
            </div>
          </fieldset>
        </form>}
      </Modal>
      <ConfirmDialog open={deleting !== null} title="Eliminar destinatario" message={<>¿Eliminar a <strong>{deleting?.name}</strong> ({deleting?.email}) de los destinatarios de este hotel?</>} confirmLabel="Eliminar destinatario" danger busy={saving} error={deleting ? apiError : null} onCancel={() => { setDeleting(null); setApiError(null); }} onConfirm={() => { void remove(); }} />
      <Toast show={toast !== null} message={toast ?? ''} onHide={() => setToast(null)} />
    </>
  );
}
