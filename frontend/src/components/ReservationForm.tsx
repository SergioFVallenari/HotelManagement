import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, buildQuery } from '../api/client';
import type { Guest, PageMeta, Reservation, Room, Service } from '../api/types';
import { Modal } from './Modal';
import { PaginationBar } from './pagination';
import { money, nightsCount, CHARGE_TYPES } from '../lib/format';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (reservation: Reservation) => void;
  onError: (err: unknown) => void;
  error?: string | null;
  onDismissError?: () => void;
}

interface GuestSelection {
  id: number;
  firstName: string;
  lastName: string;
}

export function ReservationForm({ open, onClose, onCreated, onError, error, onDismissError }: Props) {
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [searchingRooms, setSearchingRooms] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [persons, setPersons] = useState(1);

  const [guestMode, setGuestMode] = useState<'existing' | 'new'>('new');
  const [guestSearch, setGuestSearch] = useState('');
  const [guestResults, setGuestResults] = useState<GuestSelection[]>([]);
  const [guestSearched, setGuestSearched] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<GuestSelection | null>(null);
  const [newGuest, setNewGuest] = useState({ firstName: '', lastName: '', phone: '', email: '' });

  const [services, setServices] = useState<{ service: Service; quantity: number }[]>([]);
  const [servicesList, setServicesList] = useState<Service[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [guestMeta, setGuestMeta] = useState<PageMeta | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    api<{ data: Service[] }>('/services')
      .then((servicesResult) => {
        if (!alive) return;
        setServicesList(servicesResult.data.filter((s) => s.isActive));
      })
      .catch((err) => onError(err));
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    resetFormFields();
    setServices([]);
    setSelectedRoom(null);
    setRooms([]);
    setPersons(1);
    setSelectedGuest(null);
    setGuestMode('new');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function resetFormFields() {
    setCheckIn('');
    setCheckOut('');
    setGuestSearch('');
    setGuestResults([]);
    setGuestSearched(false);
    setNewGuest({ firstName: '', lastName: '', phone: '', email: '' });
    setNotes('');
    setGuestMeta(null);
  }

  async function searchAvailable() {
    if (!checkIn || !checkOut) {
      onError(new Error('Indicá check-in y check-out para buscar disponibilidad'));
      return;
    }
    setSearchingRooms(true);
    try {
      const result = await api<{ data: Room[] }>(`/rooms/available${buildQuery({ checkIn, checkOut })}`);
      setRooms(result.data);
      setSelectedRoom(null);
    } catch (err) {
      onError(err);
    } finally {
      setSearchingRooms(false);
    }
  }

  async function searchGuests() {
    setGuestSearched(true);
    try {
      const result = await api<{ data: Guest[]; meta: PageMeta }>(
        `/guests${buildQuery({ q: guestSearch || undefined, page: 1, pageSize: 10 })}`,
      );
      setGuestResults(
        result.data.map((g) => ({ id: g.id, firstName: g.firstName, lastName: g.lastName })),
      );
      setGuestMeta(result.meta);
    } catch (err) {
      onError(err);
    }
  }

  async function loadGuestPage(page: number) {
    try {
      const result = await api<{ data: Guest[]; meta: PageMeta }>(
        `/guests${buildQuery({ q: guestSearch || undefined, page })}`,
      );
      setGuestResults(result.data.map((g) => ({ id: g.id, firstName: g.firstName, lastName: g.lastName })));
      setGuestMeta(result.meta);
    } catch (err) {
      onError(err);
    }
  }

  function nights(): number {
    return checkIn && checkOut ? Math.max(1, nightsCount(checkIn, checkOut)) : 1;
  }

  function autoQuantity(service: Service, current?: number): number {
    switch (service.chargeType) {
      case 'PER_PERSON':
        return Math.max(1, persons) * nights();
      case 'PER_DAY':
        return nights();
      case 'PACK':
        return current ?? 1;
    }
  }

  function chooseRoom(room: Room) {
    setSelectedRoom(room);
    setPersons(room.capacity);
  }

  useEffect(() => {
    setServices((prev) =>
      prev.map((s) => (s.service.chargeType === 'PACK' ? s : { ...s, quantity: autoQuantity(s.service) })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIn, checkOut, persons]);

  function toggleService(service: Service) {
    setServices((prev) => {
      const exists = prev.find((s) => s.service.id === service.id);
      if (exists) return prev.filter((s) => s.service.id !== service.id);
      return [...prev, { service, quantity: autoQuantity(service) }];
    });
  }

  function setQuantity(serviceId: number, quantity: number) {
    setServices((prev) => prev.map((s) => (s.service.id === serviceId ? { ...s, quantity } : s)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedRoom) {
      onError(new Error('Seleccioná una habitación disponible'));
      return;
    }
    if (!checkIn || !checkOut) {
      onError(new Error('Indicá las fechas'));
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        roomId: selectedRoom.id,
        checkIn,
        checkOut,
        persons,
        notes: notes.trim() || null,
        services: services.map((s) => ({ serviceId: s.service.id, quantity: s.quantity })),
      };
      if (guestMode === 'existing') {
        if (!selectedGuest) {
          onError(new Error('Seleccioná un huésped existente'));
          setSaving(false);
          return;
        }
        body.guestId = selectedGuest.id;
      } else {
        if (!newGuest.firstName || !newGuest.lastName || !newGuest.phone || !newGuest.email) {
          onError(new Error('Completá nombre, apellido, teléfono y email del huésped'));
          setSaving(false);
          return;
        }
        body.guest = {
          firstName: newGuest.firstName.trim(),
          lastName: newGuest.lastName.trim(),
          phone: newGuest.phone.trim(),
          email: newGuest.email.trim(),
        };
      }

      const result = await api<{ data: Reservation }>('/reservations', { method: 'POST', body });
      onCreated(result.data);
      onClose();
    } catch (err) {
      onError(err);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <Modal open={open} title="Nueva reserva" onClose={onClose} error={error} onDismissError={onDismissError} wide>
      <form onSubmit={handleSubmit}>
        <div className="form-section">
          <h3 className="section-title">1 · Fechas y habitación</h3>
          <div className="filter-row">
            <div className="input-group mb-0" style={{ width: 'auto', flex: '0 1 auto' }}>
              <span className="input-group-text">Desde</span>
              <input type="date" className="form-control" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </div>
            <div className="input-group mb-0" style={{ width: 'auto', flex: '0 1 auto' }}>
              <span className="input-group-text">Hasta</span>
              <input type="date" className="form-control" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </div>
            <button type="button" className="btn btn-primary" onClick={searchAvailable} disabled={searchingRooms}>
              {searchingRooms ? 'Buscando…' : 'Buscar disponibles'}
            </button>
          </div>
          {rooms.length > 0 && (
            <div className="radio-list">
              {rooms.map((room) => (
                <label key={room.id} className={`radio-item ${selectedRoom?.id === room.id ? 'selected' : ''}`}>
                  <input type="radio" name="room" className="form-check-input" checked={selectedRoom?.id === room.id} onChange={() => chooseRoom(room)} />
                  <span className="flex-grow-1">
                    <strong>{room.number}</strong> · {room.type?.name} · Cap. {room.capacity}
                  </span>
                  <span className="text-secondary">{money(room.price)}/noche</span>
                </label>
              ))}
            </div>
          )}
          {selectedRoom && (
            <div className="filter-row mt-3">
              <label className="field-inline">
                <span className="form-label mb-0">Personas</span>
                <input
                  type="number"
                  min={1}
                  max={selectedRoom.capacity}
                  className="form-control"
                  style={{ width: 90 }}
                  value={persons}
                  onChange={(e) => setPersons(Math.min(selectedRoom.capacity, Math.max(1, Number(e.target.value))))}
                />
              </label>
              <span className="text-secondary small align-self-center">Capacidad máxima de la habitación: {selectedRoom.capacity}</span>
            </div>
          )}
          {rooms.length === 0 && <p className="text-secondary mt-2 mb-0">Buscá habitaciones disponibles para el rango elegido.</p>}
        </div>

        <div className="form-section">
          <h3 className="section-title">2 · Huésped</h3>
          <div className="toggle-row">
            <button type="button" className={`btn btn-sm ${guestMode === 'new' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGuestMode('new')}>
              Datos nuevos
            </button>
            <button type="button" className={`btn btn-sm ${guestMode === 'existing' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGuestMode('existing')}>
              Huésped existente
            </button>
          </div>

          {guestMode === 'new' ? (
            <div className="row g-3">
              <div className="col-sm-6">
                <label className="form-label">Nombre *</label>
                <input className="form-control" value={newGuest.firstName} onChange={(e) => setNewGuest({ ...newGuest, firstName: e.target.value })} required />
              </div>
              <div className="col-sm-6">
                <label className="form-label">Apellido *</label>
                <input className="form-control" value={newGuest.lastName} onChange={(e) => setNewGuest({ ...newGuest, lastName: e.target.value })} required />
              </div>
              <div className="col-sm-6">
                <label className="form-label">Teléfono *</label>
                <input className="form-control" value={newGuest.phone} onChange={(e) => setNewGuest({ ...newGuest, phone: e.target.value })} required />
              </div>
              <div className="col-sm-6">
                <label className="form-label">Email *</label>
                <input type="email" className="form-control" value={newGuest.email} onChange={(e) => setNewGuest({ ...newGuest, email: e.target.value })} required />
              </div>
            </div>
          ) : (
            <div>
              <div className="filter-row">
                <input
                  placeholder="Buscar por nombre, apellido, email o teléfono…"
                  className="form-control"
                  style={{ minWidth: 240, flex: '1 1 auto' }}
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                />
                <button type="button" className="btn btn-primary" onClick={searchGuests}>
                  Buscar
                </button>
              </div>
              {guestResults.length > 0 && (
                <div className="radio-list">
                  {guestResults.map((g) => (
                    <label key={g.id} className={`radio-item ${selectedGuest?.id === g.id ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="guest"
                        className="form-check-input"
                        checked={selectedGuest?.id === g.id}
                        onChange={() => setSelectedGuest(g)}
                      />
                      <span>
                        <strong>{g.lastName}, {g.firstName}</strong>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {guestSearched && guestResults.length === 0 && (
                <p className="text-secondary mt-2 mb-0">Sin resultados. Probá con datos nuevos.</p>
              )}
              {guestResults.length > 0 && (
                <div className="mt-3">
                  <PaginationBar meta={guestMeta ?? undefined} onChange={loadGuestPage} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="form-section">
          <h3 className="section-title">3 · Servicios adicionales</h3>
          {servicesList.length === 0 ? (
            <p className="text-secondary mb-0">No hay servicios habilitados.</p>
          ) : (
            <div className="row g-2">
              {servicesList.map((service) => {
                const selected = services.find((s) => s.service.id === service.id);
                return (
                  <div key={service.id} className="col-md-6">
                    <div className={`service-item ${selected ? 'selected' : ''}`}>
                      <div className="form-check">
                        <input
                          id={`svc-${service.id}`}
                          className="form-check-input"
                          type="checkbox"
                          checked={!!selected}
                          onChange={() => toggleService(service)}
                        />
                        <label className="form-check-label" htmlFor={`svc-${service.id}`}>
                          {service.name} <span className="text-secondary small">({money(service.price)})</span>
                        </label>
                      </div>
                      {selected && (
                        <div className="d-flex align-items-center gap-2 mt-2">
                          {service.chargeType === 'PACK' ? (
                            <>
                              <label className="form-label mb-0 small">Cant.</label>
                              <input
                                type="number"
                                min={1}
                                className="form-control form-control-sm w-auto"
                                value={selected.quantity}
                                onChange={(e) => setQuantity(service.id, Math.max(1, Number(e.target.value)))}
                              />
                              <span className="text-secondary small">· {CHARGE_TYPES[service.chargeType]}</span>
                            </>
                          ) : (
                            <span className="text-secondary small">
                              {selected.quantity} unidades = {service.chargeType === 'PER_PERSON' ? `${Math.max(1, persons)} pers. × ${nights()} noche(s)` : `${nights()} noche(s)`} · {CHARGE_TYPES[service.chargeType]}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="form-section">
          <h3 className="section-title">4 · Notas</h3>
          <label className="form-label">Notas del huésped</label>
          <textarea className="form-control" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Reservando…' : 'Confirmar reserva'}
          </button>
        </div>
      </form>
    </Modal>
  );
}