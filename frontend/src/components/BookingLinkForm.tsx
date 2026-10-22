import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, buildQuery } from '../api/client';
import type { BookingLink, CompanySettings, Room, Service } from '../api/types';
import { Modal } from './Modal';
import { money, nightsCount, round2, clampAmount, CHARGE_TYPES, CHECK_IN_TIME, CHECK_OUT_TIME } from '../lib/format';
import { computeBookingDeposit, serviceQuantity } from '../lib/pricing';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (link: BookingLink) => void;
  onError: (err: unknown) => void;
  error?: string | null;
  onDismissError?: () => void;
}

interface SelectedService {
  service: Service;
  personsCovered: number | null;
}

export function BookingLinkForm({ open, onClose, onCreated, onError, error, onDismissError }: Props) {
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [persons, setPersons] = useState(1);
  const [extraBeds, setExtraBeds] = useState(0);
  const [servicesList, setServicesList] = useState<Service[]>([]);
  const [services, setServices] = useState<SelectedService[]>([]);
  const [depositOverride, setDepositOverride] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('15');
  const [depositPercent, setDepositPercent] = useState(20);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    api<{ data: Service[] }>('/services')
      .then((result) => {
        if (alive) setServicesList(result.data.filter((s) => s.isActive));
      })
      .catch((err) => onError(err));
    api<{ data: CompanySettings }>('/companies/current')
      .then((result) => {
        if (alive) setDepositPercent(result.data.bookingDepositPercent);
      })
      .catch(() => {
        // sin configuracion se usa el 20% por defecto
      });
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setCheckIn('');
    setCheckOut('');
    setRooms([]);
    setSelectedRoom(null);
    setPersons(1);
    setExtraBeds(0);
    setServices([]);
    setDepositOverride('');
    setExpiresInDays('15');
  }, [open]);

  const nights = checkIn && checkOut ? Math.max(1, nightsCount(checkIn, checkOut)) : 1;
  const maxPersons = Math.max(1, persons + extraBeds);

  // Las cantidades se derivan en render: si cambian las fechas o las personas,
  // se recalculan solas y no hay estado duplicado que pueda quedar viejo.
  function quantityOf(service: Service, personsCovered: number | null): number {
    const requested = personsCovered === null ? null : Math.min(personsCovered, maxPersons);
    return serviceQuantity(service.chargeType, { persons, extraBeds, nights }, requested, service.isExtraBed);
  }

  const servicesTotal = round2(
    services.reduce((acc, item) => acc + quantityOf(item.service, item.personsCovered) * item.service.price, 0),
  );
  const total = round2((selectedRoom?.price ?? 0) * nights + servicesTotal);
  const suggestedDeposit = computeBookingDeposit(total, depositPercent);

  async function searchAvailable() {
    if (!checkIn || !checkOut) {
      onError(new Error('Indicá check-in y check-out para buscar disponibilidad'));
      return;
    }
    setSearching(true);
    try {
      const result = await api<{ data: Room[] }>(`/rooms/available${buildQuery({ checkIn, checkOut })}`);
      setRooms(result.data);
      setSelectedRoom(null);
    } catch (err) {
      onError(err);
    } finally {
      setSearching(false);
    }
  }

  function chooseRoom(room: Room) {
    setSelectedRoom(room);
    setPersons(room.capacity);
    setExtraBeds(0);
    setServices((prev) => prev.filter((item) => !item.service.isExtraBed));
  }

  function toggleService(service: Service) {
    const exists = services.some((item) => item.service.id === service.id);
    if (exists) {
      setServices((prev) => prev.filter((item) => item.service.id !== service.id));
      return;
    }
    if (service.isExtraBed && extraBeds === 0) {
      setExtraBeds(Math.min(1, selectedRoom?.maxExtraBeds ?? 1));
    }
    setServices((prev) => [...prev, { service, personsCovered: null }]);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedRoom) {
      onError(new Error('Elegí una habitación disponible'));
      return;
    }
    if (extraBeds > 0 && persons < selectedRoom.capacity) {
      onError(new Error('Las camas extras solo pueden cargarse cuando la habitación está llena'));
      return;
    }
    const deposit = depositOverride.trim() === '' ? undefined : clampAmount(Number(depositOverride), total);
    if (deposit !== undefined && deposit <= 0) {
      onError(new Error('Indicá un monto de anticipo válido o dejalo vacío para usar el porcentaje del hotel'));
      return;
    }
    const days = Number(expiresInDays);
    setSaving(true);
    try {
      const result = await api<{ data: BookingLink }>('/booking-links', {
        method: 'POST',
        body: {
          roomId: selectedRoom.id,
          checkIn,
          checkOut,
          persons,
          extraBeds,
          services: services.map((item) => ({
            serviceId: item.service.id,
            quantity: quantityOf(item.service, item.personsCovered),
            ...(item.personsCovered !== null ? { personsCovered: item.personsCovered } : {}),
          })),
          ...(deposit !== undefined ? { deposit } : {}),
          ...(Number.isInteger(days) && days > 0 ? { expiresInDays: days } : {}),
        },
      });
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
    <Modal open={open} title="Nueva solicitud de reserva" onClose={onClose} error={error} onDismissError={onDismissError} wide>
      <form onSubmit={handleSubmit}>
        <div className="form-section">
          <h3 className="section-title">1 · Fechas y habitación</h3>
          <div className="filter-row">
            <div className="input-group mb-0" style={{ width: 'auto', flex: '0 1 auto' }}>
              <span className="input-group-text">Desde</span>
              <input type="date" className="form-control" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required />
            </div>
            <div className="input-group mb-0" style={{ width: 'auto', flex: '0 1 auto' }}>
              <span className="input-group-text">Hasta</span>
              <input type="date" className="form-control" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required />
            </div>
            <button type="button" className="btn btn-primary" onClick={searchAvailable} disabled={searching}>
              {searching ? 'Buscando…' : 'Buscar disponibles'}
            </button>
          </div>

          {rooms.length > 0 && (
            <div className="radio-list">
              {rooms.map((room) => (
                <label key={room.id} className={`radio-item ${selectedRoom?.id === room.id ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="booking-room"
                    className="form-check-input"
                    checked={selectedRoom?.id === room.id}
                    onChange={() => chooseRoom(room)}
                  />
                  <span className="flex-grow-1">
                    <strong>{room.number}</strong> · {room.type?.name} · Cap. {room.capacity}
                  </span>
                  <span className="text-secondary">{money(room.price)}/noche</span>
                </label>
              ))}
            </div>
          )}

          {selectedRoom && (
            <div className="filter-row mt-3 flex-wrap">
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
              {selectedRoom.maxExtraBeds > 0 && (
                <label className="field-inline">
                  <span className="form-label mb-0">Camas extras</span>
                  <input
                    type="number"
                    min={0}
                    max={selectedRoom.maxExtraBeds}
                    className="form-control"
                    style={{ width: 90 }}
                    value={extraBeds}
                    onChange={(e) => {
                      const value = Math.min(selectedRoom.maxExtraBeds, Math.max(0, Number(e.target.value)));
                      setExtraBeds(value);
                      if (value === 0) setServices((prev) => prev.filter((item) => !item.service.isExtraBed));
                    }}
                  />
                </label>
              )}
              <span className="text-secondary small align-self-center">
                El huésped ve el tipo de habitación y las fechas, no el número.
              </span>
              {extraBeds > 0 && persons < selectedRoom.capacity && (
                <span className="text-danger small align-self-center w-100">
                  Las camas extras solo pueden cargarse cuando la habitación está llena.
                </span>
              )}
            </div>
          )}
          {rooms.length === 0 && <p className="text-secondary mt-2 mb-0">Buscá habitaciones disponibles para el rango elegido.</p>}
          <p className="text-secondary small mb-0">
            Horario: check-in desde las {CHECK_IN_TIME} · check-out hasta las {CHECK_OUT_TIME}.
          </p>
        </div>

        <div className="form-section">
          <h3 className="section-title">2 · Servicios incluidos</h3>
          {servicesList.length === 0 ? (
            <p className="text-secondary mb-0">No hay servicios habilitados.</p>
          ) : (
            <div className="row g-2">
              {servicesList.map((service) => {
                const selected = services.find((item) => item.service.id === service.id);
                return (
                  <div key={service.id} className="col-md-6">
                    <div className={`service-item ${selected ? 'selected' : ''}`}>
                      <div className="form-check">
                        <input
                          id={`booking-svc-${service.id}`}
                          className="form-check-input"
                          type="checkbox"
                          checked={!!selected}
                          onChange={() => toggleService(service)}
                        />
                        <label className="form-check-label" htmlFor={`booking-svc-${service.id}`}>
                          {service.name} <span className="text-secondary small">({money(service.price)})</span>
                        </label>
                      </div>
                      {selected && (
                        <div className="d-flex align-items-center gap-2 mt-2 flex-wrap">
                          {service.chargeType === 'PER_PERSON' ? (
                            <>
                              <label className="form-label mb-0 small">Personas</label>
                              <input
                                type="number"
                                min={1}
                                max={maxPersons}
                                className="form-control form-control-sm w-auto"
                                style={{ width: 80 }}
                                value={Math.min(selected.personsCovered ?? maxPersons, maxPersons)}
                                onChange={(e) => {
                                  const value = Math.max(1, Math.min(maxPersons, Number(e.target.value || 1)));
                                  setServices((prev) =>
                                    prev.map((item) =>
                                      item.service.id === service.id
                                        ? { ...item, personsCovered: value }
                                        : item,
                                    ),
                                  );
                                }}
                              />
                              <span className="text-secondary small">
                                {quantityOf(service, selected.personsCovered)} unidades · {CHARGE_TYPES[service.chargeType]}
                              </span>
                            </>
                          ) : (
                            <span className="text-secondary small">
                              {quantityOf(service, selected.personsCovered)} unidades · {CHARGE_TYPES[service.chargeType]}
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
          <h3 className="section-title">3 · Anticipo y vigencia</h3>
          {!selectedRoom ? (
            <p className="text-secondary mb-0">Elegí una habitación para ver el total y el anticipo sugerido.</p>
          ) : (
            <>
              <div className="totals-box">
                <div>
                  <span>Total de la estadía</span>
                  <strong>{money(total)}</strong>
                </div>
                <div>
                  <span>Anticipo ({depositPercent}% redondeado a $10.000)</span>
                  <strong className="text-success">
                    {money(depositOverride.trim() === '' ? suggestedDeposit : clampAmount(Number(depositOverride), total))}
                  </strong>
                </div>
              </div>
              <div className="filter-row">
                <label className="field-inline">
                  <span className="form-label mb-0">Anticipo manual</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="form-control"
                    style={{ width: 160 }}
                    value={depositOverride}
                    onChange={(e) => setDepositOverride(e.target.value)}
                    onBlur={() =>
                      setDepositOverride((value) => (value.trim() === '' ? '' : String(clampAmount(Number(value), total))))
                    }
                    placeholder={String(suggestedDeposit)}
                  />
                </label>
                <label className="field-inline">
                  <span className="form-label mb-0">Vigencia (días)</span>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    className="form-control"
                    style={{ width: 110 }}
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(e.target.value)}
                  />
                </label>
              </div>
              <div className="form-text">
                El total y el anticipo quedan fijos en el link: si después cambian los precios, esta solicitud no se
                modifica.
              </div>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || !selectedRoom}>
            {saving ? 'Creando…' : 'Crear link'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
