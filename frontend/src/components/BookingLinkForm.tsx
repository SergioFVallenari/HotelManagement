import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, buildQuery } from '../api/client';
import type { BookingLink, CompanySettings, Discount, Room, Service } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DiscountInput } from './DiscountInput';
import { Modal } from './Modal';
import { RoomSelection } from './RoomSelection';
import { selectedRoomsTotal, type SelectedRoom } from '../lib/reservationRooms';
import { money, nightsCount, round2, clampAmount, CHARGE_TYPES, CHECK_IN_TIME, CHECK_OUT_TIME } from '../lib/format';
import { computeBookingDeposit, discountPreview, serviceQuantity } from '../lib/pricing';
import { serviceQuantityLabel } from '../lib/services';

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
  const { user } = useAuth();
  const canDiscount = user?.role === 'ADMIN' || user?.role === 'OWNER';
  const [discount, setDiscount] = useState<Discount | null>(null);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedRooms, setSelectedRooms] = useState<SelectedRoom[]>([]);
  const selectedRoom = selectedRooms[0]?.room ?? null;
  const persons = selectedRooms.reduce((sum, line) => sum + line.persons, 0);
  const extraBeds = selectedRooms.reduce((sum, line) => sum + line.extraBeds, 0);
  const [servicesList, setServicesList] = useState<Service[]>([]);
  const [services, setServices] = useState<SelectedService[]>([]);
  const [depositOverride, setDepositOverride] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('15');
  const [depositPercent, setDepositPercent] = useState(20);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    api<{ data: Service[] }>('/services', { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setServicesList(result.data.filter((s) => s.isActive));
      })
      .catch((err) => { if (!controller.signal.aborted) onError(err); });
    api<{ data: CompanySettings }>('/companies/current', { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setDepositPercent(result.data.bookingDepositPercent);
      })
      .catch(() => {
        // sin configuracion se usa el 20% por defecto
      });
    return () => {
      controller.abort();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setCheckIn('');
    setCheckOut('');
    setRooms([]);
    setSelectedRooms([]);
    setServices([]);
    setDepositOverride('');
    setDiscount(null);
    setExpiresInDays('15');
  }, [open]);

  const nights = checkIn && checkOut ? Math.max(1, nightsCount(checkIn, checkOut)) : 1;
  const maxPersons = Math.max(1, persons);

  // Las cantidades se derivan en render: si cambian las fechas o las personas,
  // se recalculan solas y no hay estado duplicado que pueda quedar viejo.
  function quantityOf(service: Service, personsCovered: number | null): number {
    const requested = personsCovered === null ? null : Math.min(personsCovered, maxPersons);
    return serviceQuantity(service.chargeType, { persons, extraBeds, nights, roomCount: selectedRooms.length }, service.chargeType === 'PER_PERSON' ? requested ?? maxPersons : requested, service.isExtraBed, service.intervalDays);
  }

  const servicesTotal = round2(
    services.reduce((acc, item) => acc + quantityOf(item.service, item.personsCovered) * item.service.price, 0),
  );
  const subtotal = round2(selectedRoomsTotal(selectedRooms, nights) + servicesTotal);
  const discountAmount = discountPreview(subtotal, canDiscount ? discount : null);
  const total = round2(subtotal - discountAmount);
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
      setSelectedRooms([]);
    } catch (err) {
      onError(err);
    } finally {
      setSearching(false);
    }
  }

  function toggleService(service: Service) {
    const exists = services.some((item) => item.service.id === service.id);
    if (exists) {
      setServices((prev) => prev.filter((item) => item.service.id !== service.id));
      return;
    }
    if (service.isExtraBed && extraBeds === 0) {
      onError(new Error('Indicá primero las camas extras en las habitaciones seleccionadas'));
      return;
    }
    setServices((prev) => [...prev, { service, personsCovered: null }]);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedRoom) {
      onError(new Error('Elegí una habitación disponible'));
      return;
    }
    if (selectedRooms.some((line) => line.extraBeds > 0 && line.persons < line.room.capacity)) {
      onError(new Error('Las camas extras solo pueden cargarse cuando la habitación está llena'));
      return;
    }
    const deposit = depositOverride.trim() === '' ? undefined : clampAmount(Number(depositOverride), total);
    if (deposit !== undefined && deposit <= 0 && total > 0) {
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
          rooms: selectedRooms.map((line) => ({ roomId: line.room.id, persons: line.persons, extraBeds: line.extraBeds })),
          checkIn,
          checkOut,
          persons,
          extraBeds,
          services: services.map((item) => ({
            serviceId: item.service.id,
            quantity: Math.max(1, quantityOf(item.service, item.personsCovered)),
            ...(item.personsCovered !== null ? { personsCovered: item.personsCovered } : {}),
          })),
          ...(deposit !== undefined ? { deposit } : {}),
          ...(canDiscount && discount ? { discount } : {}),
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
          <h3 className="section-title">1 · Fechas y habitaciones</h3>
          <div className="filter-row">
            <div className="input-group mb-0" style={{ width: 'auto', flex: '0 1 auto' }}>
              <span className="input-group-text">Desde</span>
              <input type="date" className="form-control" value={checkIn} onChange={(e) => { setCheckIn(e.target.value); setRooms([]); setSelectedRooms([]); }} required />
            </div>
            <div className="input-group mb-0" style={{ width: 'auto', flex: '0 1 auto' }}>
              <span className="input-group-text">Hasta</span>
              <input type="date" className="form-control" value={checkOut} onChange={(e) => { setCheckOut(e.target.value); setRooms([]); setSelectedRooms([]); }} required />
            </div>
            <button type="button" className="btn btn-primary" onClick={searchAvailable} disabled={searching}>
              {searching ? 'Buscando…' : 'Buscar disponibles'}
            </button>
          </div>

          {rooms.length > 0 && <RoomSelection rooms={rooms} value={selectedRooms} onChange={setSelectedRooms} />}
          <p className="small text-secondary">El huésped ve los tipos de habitación, no los números.</p>
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
                      {service.description && <div className="small text-secondary text-break mt-1" style={{ whiteSpace: 'pre-line' }}>{service.description}</div>}
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
                              {quantityOf(service, selected.personsCovered)} unidades · {service.chargeType === 'PER_ROOM_INTERVAL' ? serviceQuantityLabel({ ...service, quantity: quantityOf(service, selected.personsCovered) }, { persons, nights }, selectedRooms.length) : CHARGE_TYPES[service.chargeType]}
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
              {canDiscount && <DiscountInput value={discount} subtotal={subtotal} onChange={setDiscount} />}
              <div className="totals-box">
                {canDiscount && discount && <>
                  <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
                  <div><span>Descuento{discount.type === 'PERCENTAGE' ? ` (${discount.value}%)` : ''}</span><strong className="text-success">−{money(discountAmount)}</strong></div>
                </>}
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
