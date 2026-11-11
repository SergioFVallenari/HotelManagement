import { useRef, useState } from 'react';
import { api } from '../api/client';
import type { Reservation } from '../api/types';
import { Modal } from './Modal';
import { dateShort, money } from '../lib/format';
import { appendDictationText } from '../lib/voiceInput';
import { VoiceInput } from './VoiceInput';

interface Message { role: 'user' | 'model'; text: string }
interface Proposal {
  token: string;
  checkIn: string;
  checkOut: string;
  guest: string;
  email: string | null;
  phone: string | null;
  existingGuest: boolean;
  rooms: { number: string; type: string; persons: number; extraBeds: number; total: number }[];
  services: { name: string; quantity: number; total: number }[];
  notes?: string | null;
  total: number;
}

export function ReservationChat({ onClose, onCreated }: { onClose: () => void; onCreated: (reservation: Reservation) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Reservation | null>(null);
  const [dictating, setDictating] = useState(false);
  const [voiceWarning, setVoiceWarning] = useState<string | null>(null);
  const pending = useRef(false);
  const voiceActive = useRef(false);
  const draftText = useRef('');

  function changeText(value: string) {
    draftText.current = value;
    setText(value);
    setVoiceWarning(null);
  }

  function addDictation(value: string) {
    const result = appendDictationText(draftText.current, value);
    changeText(result.text);
    if (result.truncated) setVoiceWarning('El pedido alcanzó el límite de 6000 caracteres. Revisá el final del texto antes de enviarlo.');
  }

  function setVoiceActive(active: boolean) {
    voiceActive.current = active;
    setDictating(active);
  }

  async function send() {
    if (!text.trim() || pending.current || voiceActive.current || created) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setProposal(null);
    const next: Message[] = [...messages, { role: 'user', text: text.trim() }];
    try {
      const result = await api<{ data: { reply: string; proposal: Proposal | null } }>('/ai/reservations/chat', { method: 'POST', body: { messages: next }, timeoutMs: 65000 });
      setMessages([...next, { role: 'model', text: result.data.reply }]);
      setProposal(result.data.proposal);
      changeText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo consultar al asistente.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function confirm() {
    if (!proposal || pending.current || voiceActive.current || created) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ data: Reservation }>('/ai/reservations/confirm', { method: 'POST', body: { token: proposal.token }, timeoutMs: 30000 });
      setCreated(result.data);
      setProposal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la reserva.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function close() {
    if (pending.current) return;
    if (created) onCreated(created);
    onClose();
  }

  return <Modal open wide title="Reservar con IA" onClose={close} preventClose={busy} error={error} onDismissError={() => setError(null)}>
    <p className="text-secondary">Indicá fechas, personas y titular. Revisás la propuesta antes de crear una reserva sin pagos. Este chat no usa Instagram.</p>
    <div role="log" aria-live="polite" className="d-flex flex-column gap-2 mb-3" style={{ maxHeight: '35vh', overflowY: 'auto' }}>
      {messages.map((message, index) => <div key={index} className={`p-3 rounded ${message.role === 'user' ? 'bg-primary-subtle' : 'bg-body-tertiary'}`} style={{ whiteSpace: 'pre-wrap' }}>
        <strong>{message.role === 'user' ? 'Vos' : 'Asistente'}: </strong>{message.text}
      </div>)}
      {busy && <p role="status" className="text-secondary">{proposal ? 'Creando reserva…' : 'Consultando…'}</p>}
    </div>
    {proposal && <section className="border rounded p-3 mb-3" aria-label="Propuesta de reserva">
      <h3 className="h6">Propuesta para {proposal.guest}</h3>
      <p className="small text-secondary">{proposal.existingGuest ? 'Huésped existente' : 'Nuevo huésped'} · {proposal.email || 'Sin email'} · {proposal.phone || 'Sin teléfono'}</p>
      <p>{dateShort(proposal.checkIn)} → {dateShort(proposal.checkOut)}</p>
      {proposal.rooms.map((room) => <p key={room.number} className="mb-1">Habitación {room.number} · {room.type} · {room.persons} personas · {room.extraBeds} camas extras: {money(room.total)}</p>)}
      {proposal.services.map((service) => <p key={service.name} className="mb-1">{service.name} × {service.quantity}: {money(service.total)}</p>)}
      {proposal.notes && <p>Notas: {proposal.notes}</p>}
      <p className="fw-bold mt-2">Total: {money(proposal.total)}</p>
      <p className="small text-secondary">La propuesta vence en 10 minutos. La disponibilidad y los precios se verifican al confirmar.</p>
      <button className="btn btn-primary" type="button" disabled={busy || dictating || Boolean(text.trim())} onClick={confirm}>Crear reserva</button>
    </section>}
    {created ? <div className="alert alert-success" role="status">
      Reserva <strong>{created.code}</strong> creada sin pagos.
      <button type="button" className="btn btn-success ms-2" onClick={close}>Ver reserva</button>
    </div> : <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <label htmlFor="reservation-chat" className="form-label">Tu pedido o corrección</label>
      <textarea id="reservation-chat" className="form-control mb-2" rows={3} maxLength={6000} value={text} disabled={busy || dictating || messages.length >= 30} onChange={(event) => changeText(event.target.value)} placeholder="Reservame del 2 al 5 de diciembre de 2026 una sola habitación para 3 personas a nombre de Juan Pérez" />
      <button type="submit" className="btn btn-outline-primary" disabled={busy || dictating || !text.trim() || messages.length >= 30}>Enviar</button>
      <VoiceInput disabled={busy || messages.length >= 30 || text.length >= 6000} onText={addDictation} onActiveChange={setVoiceActive} />
      {voiceWarning && <p role="alert" className="text-warning-emphasis small mt-2">{voiceWarning}</p>}
      {messages.length >= 30 && <p className="text-secondary mt-2">Llegaste al límite de esta conversación. Cerrá y abrí el chat para empezar otra.</p>}
    </form>}
    <div className="modal-actions"><button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={close}>Cerrar</button></div>
  </Modal>;
}
