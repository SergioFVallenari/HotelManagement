import { useEffect, useState } from 'react';
import { guestContactSchema, validateContact } from '../lib/contactValidation';
import type { FormEvent } from 'react';
import { api, buildQuery } from '../api/client';
import { DEMO_MODE } from '../demo/config';
import type { Discount, Guest, PageMeta, PaymentMethod, Reservation, Room, Service } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DiscountInput } from './DiscountInput';
import { Modal } from './Modal';
import { RoomSelection } from './RoomSelection';
import { IndependentReservationFields } from './IndependentReservationFields';
import { buildIndependentReservations, type IndependentReservationDetails } from '../lib/reservationBatch';
import { selectedRoomsTotal, type SelectedRoom } from '../lib/reservationRooms';
import { PaginationBar } from './pagination';
import { money, nightsCount, round2, clampAmount, CHARGE_TYPES, CHECK_IN_TIME, CHECK_OUT_TIME, PAYMENT_METHODS } from '../lib/format';
import { discountPreview, serviceQuantity } from '../lib/pricing';
import { serviceQuantityLabel } from '../lib/services';

const SUGGESTED_DEPOSIT_RATE = 0.15;
const DEPOSIT_METHODS: PaymentMethod[] = DEMO_MODE ? ['CASH', 'CARD', 'TRANSFER'] : ['CASH', 'CARD', 'TRANSFER', 'MERCADOPAGO'];
type DepositMode = 'none' | 'suggested' | 'custom';

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
  const { user } = useAuth();
  const canDiscount = user?.role === 'ADMIN' || user?.role === 'OWNER';
  const [discount, setDiscount] = useState<Discount | null>(null);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [searchingRooms, setSearchingRooms] = useState(false);
  const [selectedRooms, setSelectedRooms] = useState<SelectedRoom[]>([]);
  const selectedRoom = selectedRooms[0]?.room ?? null;
  const persons = selectedRooms.reduce((sum, line) => sum + line.persons, 0);
  const extraBeds = selectedRooms.reduce((sum, line) => sum + line.extraBeds, 0);

  const [guestMode, setGuestMode] = useState<'existing' | 'new' | 'generic'>('new');
  const [independent, setIndependent] = useState(false);
  const [independentDetails, setIndependentDetails] = useState<Record<number, IndependentReservationDetails>>({});
  const [guestSearch, setGuestSearch] = useState('');
  const [guestResults, setGuestResults] = useState<GuestSelection[]>([]);
  const [guestSearched, setGuestSearched] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<GuestSelection | null>(null);
  const [newGuest, setNewGuest] = useState({ firstName: '', lastName: '', phone: '', email: '' });

  const [services, setServices] = useState<{ service: Service; quantity: number; personsCovered?: number | null }[]>([]);
  const [servicesList, setServicesList] = useState<Service[]>([]);
  const [notes, setNotes] = useState('');
  const [paymentLink, setPaymentLink] = useState(false);
  const [depositMode, setDepositMode] = useState<DepositMode>('none');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>('CASH');
  const [saving, setSaving] = useState(false);

  const [guestMeta, setGuestMeta] = useState<PageMeta | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    api<{ data: Service[] }>('/services', { signal: controller.signal })
      .then((servicesResult) => {
        if (controller.signal.aborted) return;
        setServicesList(servicesResult.data.filter((s) => s.isActive));
      })
      .catch((err) => { if (!controller.signal.aborted) onError(err); });
    return () => {
      controller.abort();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    resetFormFields();
    setServices([]);
    setSelectedRooms([]);
    setRooms([]);
    setSelectedGuest(null);
    setGuestMode('new');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function resetFormFields() {
    setIndependent(false);
    setIndependentDetails({});
    setCheckIn('');
    setCheckOut('');
    setGuestSearch('');
    setGuestResults([]);
    setGuestSearched(false);
    setNewGuest({ firstName: '', lastName: '', phone: '', email: '' });
    setNotes('');
    setDiscount(null);
    setPaymentLink(false);
    setDepositMode('none');
    setDepositAmount('');
    setDepositMethod('CASH');
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
      setSelectedRooms([]);
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

  function maxPersons(): number {
    return Math.max(1, persons);
  }

  function autoQuantity(
    service: Service,
    item?: { quantity: number; personsCovered?: number | null },
  ): number {
    return serviceQuantity(service.chargeType, { persons, extraBeds, nights: nights(), roomCount: selectedRooms.length }, service.chargeType === 'PACK' ? item?.quantity : service.chargeType === 'PER_PERSON' ? item?.personsCovered ?? maxPersons() : undefined, service.isExtraBed, service.intervalDays);
  }

useEffect(() => {
  setServices((prev) =>
    prev.map((s) => {
      if (s.service.chargeType === 'PACK') return s;
      const clipped =
        s.personsCovered !== undefined && s.personsCovered !== null
          ? Math.min(s.personsCovered, maxPersons())
          : s.personsCovered;
      const item = clipped === s.personsCovered ? s : { ...s, personsCovered: clipped };
      return { ...item, quantity: autoQuantity(s.service, item) };
    }),
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [checkIn, checkOut, persons, extraBeds, selectedRooms.length]);

function setPersonsCovered(serviceId: number, personsCovered: number | null) {
  setServices((prev) =>
    prev.map((s) =>
      s.service.id === serviceId
        ? { ...s, personsCovered, quantity: autoQuantity(s.service, { ...s, personsCovered }) }
        : s,
    ),
  );
}

  function toggleService(service: Service) {
    const exists = services.some((s) => s.service.id === service.id);
    if (exists) {
      setServices((prev) => prev.filter((s) => s.service.id !== service.id));
      return;
    }
    if (service.isExtraBed && extraBeds === 0) {
      onError(new Error('Indicá primero las camas extras en las habitaciones seleccionadas'));
      return;
    }
    setServices((prev) => [...prev, { service, quantity: autoQuantity(service) }]);
  }

  function setQuantity(serviceId: number, quantity: number) {
    setServices((prev) => prev.map((s) => (s.service.id === serviceId ? { ...s, quantity } : s)));
  }

  function changeRooms(value: SelectedRoom[]) {
    setSelectedRooms(value);
    const beds = value.reduce((sum, line) => sum + line.extraBeds, 0);
    setServices((previous) => {
      if (beds === 0) return previous.filter((line) => !line.service.isExtraBed);
      if (previous.some((line) => line.service.isExtraBed)) return previous;
      const service = servicesList.find((item) => item.isExtraBed);
      return service ? [...previous, { service, quantity: beds * nights() }] : previous;
    });
  }

  function estimateSubtotal(): number {
    if (!selectedRoom) return 0;
    const servicesTotal = services.reduce((acc, s) => acc + s.quantity * s.service.price, 0);
    return round2(selectedRoomsTotal(selectedRooms, nights()) + servicesTotal);
  }

  function estimateTotal(): number {
    const subtotal = estimateSubtotal();
    return round2(subtotal - discountPreview(subtotal, canDiscount ? discount : null));
  }

  function suggestedDeposit(): number {
    return round2(estimateTotal() * SUGGESTED_DEPOSIT_RATE);
  }

  function selectDepositMode(mode: DepositMode) {
    setDepositMode(mode);
    if (mode === 'custom' && !depositAmount) setDepositAmount(String(suggestedDeposit()));
  }

  function resolvedDeposit(): number {
    if (depositMode === 'none') return 0;
    const total = estimateTotal();
    if (depositMode === 'suggested') return clampAmount(suggestedDeposit(), total);
    return clampAmount(Number(depositAmount), total);
  }

  function depositBalance(): number {
    return round2(estimateTotal() - resolvedDeposit());
  }

  function depositViaMp(): boolean {
    return depositMode !== 'none' && depositMethod === 'MERCADOPAGO';
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!selectedRoom) {
      onError(new Error('Seleccioná una habitación disponible'));
      return;
    }
    if (!checkIn || !checkOut) {
      onError(new Error('Indicá las fechas'));
      return;
    }
    if (selectedRooms.some((line) => line.extraBeds > 0 && line.persons < line.room.capacity)) {
      onError(new Error('Las camas extras solo pueden cargarse cuando la habitación está llena'));
      return;
    }
    if (independent) {
      setSaving(true);
      try {
        const reservations = buildIndependentReservations(selectedRooms, checkIn, checkOut, independentDetails, servicesList.find((item) => item.isExtraBed));
        const result = await api<{ data: Reservation[] }>('/reservations/batch', { method: 'POST', body: { reservations } });
        onCreated(result.data[0]);
        onClose();
      } catch (err) {
        onError(err);
      } finally {
        setSaving(false);
      }
      return;
    }
    const total = estimateTotal();
    let deposit = 0;
    if (depositMode !== 'none') {
      const requested = depositMode === 'suggested' ? suggestedDeposit() : Number(depositAmount);
      if (!Number.isFinite(requested) || requested <= 0) {
        onError(new Error('Indicá un monto de anticipo válido'));
        return;
      }
      deposit = round2(requested);
      if (deposit > total) {
        onError(new Error(`El anticipo no puede superar el total de la reserva (total ${money(total)})`));
        return;
      }
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        roomId: selectedRoom.id,
        rooms: selectedRooms.map((line) => ({ roomId: line.room.id, persons: line.persons, extraBeds: line.extraBeds })),
        checkIn,
        checkOut,
        persons,
        extraBeds,
        notes: notes.trim() || null,
        ...(canDiscount && discount ? { discount } : {}),
        ...(depositViaMp() ? {} : { generatePaymentLink: paymentLink }),
        ...(deposit > 0 ? { payment: { amount: deposit, method: depositMethod } } : {}),
        services: services.map((s) => ({
          serviceId: s.service.id,
          quantity: Math.max(1, s.quantity),
          ...(s.personsCovered !== undefined && s.personsCovered !== null ? { personsCovered: s.personsCovered } : {}),
        })),
      };
      if (guestMode === 'existing') {
        if (!selectedGuest) {
          onError(new Error('Seleccioná un huésped existente'));
          setSaving(false);
          return;
        }
        body.guestId = selectedGuest.id;
      } else if (guestMode === 'generic') {
        body.genericGuest = true;
      } else {
        if (!newGuest.firstName.trim() || !newGuest.lastName.trim()) {
          onError(new Error('Completá nombre y apellido del huésped'));
          setSaving(false);
          return;
        }
        body.guest = {
          firstName: newGuest.firstName.trim(),
          lastName: newGuest.lastName.trim(),
          ...validateContact(guestContactSchema, newGuest),
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
    <Modal open={open} title={independent ? 'Nuevas reservas independientes' : 'Nueva reserva'} onClose={onClose} error={error} onDismissError={onDismissError} preventClose={saving} wide>
      <form onSubmit={handleSubmit}>
        <fieldset disabled={saving}>
        <div className="mb-4">
          <label className="form-label" htmlFor="reservation-create-mode">Tipo de carga</label>
          <select id="reservation-create-mode" className="form-select" value={independent ? 'independent' : 'group'} onChange={(e) => setIndependent(e.target.value === 'independent')}>
            <option value="group">Una reserva · uno o varios alojamientos para el mismo huésped</option>
            <option value="independent">Varias reservas · una por habitación, para huéspedes distintos</option>
          </select>
          {independent && <p className="form-text mb-0">Ideal para gente de paso: elegí las fechas una sola vez y marcá los dormis. Se guardan todas juntas; si alguna habitación ya se ocupó, no se crea ninguna.</p>}
        </div>
        <div className="form-section">
          <h3 className="section-title">1 · Fechas y habitaciones</h3>
          <div className="filter-row">
            <div className="input-group mb-0" style={{ width: 'auto', flex: '0 1 auto' }}>
              <span className="input-group-text">Desde</span>
              <input type="date" className="form-control" value={checkIn} onChange={(e) => { setCheckIn(e.target.value); setRooms([]); setSelectedRooms([]); }} />
            </div>
            <div className="input-group mb-0" style={{ width: 'auto', flex: '0 1 auto' }}>
              <span className="input-group-text">Hasta</span>
              <input type="date" className="form-control" value={checkOut} onChange={(e) => { setCheckOut(e.target.value); setRooms([]); setSelectedRooms([]); }} />
            </div>
            <button type="button" className="btn btn-primary" onClick={searchAvailable} disabled={searchingRooms}>
              {searchingRooms ? 'Buscando…' : 'Buscar disponibles'}
            </button>
          </div>
          {rooms.length > 0 && <RoomSelection rooms={rooms} value={selectedRooms} onChange={changeRooms} independent={independent} />}
          {rooms.length === 0 && <p className="text-secondary mt-2 mb-0">Buscá habitaciones disponibles para el rango elegido.</p>}
          <p className="text-secondary small mb-0">
            Horario: check-in desde las {CHECK_IN_TIME} · check-out hasta las {CHECK_OUT_TIME} (noche a partir de la fecha de check-in).
          </p>
        </div>

        {independent ? <IndependentReservationFields rooms={selectedRooms} nights={nights()} details={independentDetails} onChange={(roomId, value) => setIndependentDetails((previous) => ({ ...previous, [roomId]: value }))} extraBedService={servicesList.find((item) => item.isExtraBed)} /> : <>
        <div className="form-section">
          <h3 className="section-title">2 · Huésped</h3>
          <div className="toggle-row">
            <button type="button" className={`btn btn-sm ${guestMode === 'new' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGuestMode('new')}>
              Datos nuevos
            </button>
            <button type="button" className={`btn btn-sm ${guestMode === 'existing' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGuestMode('existing')}>
              Huésped existente
            </button>
            <button type="button" className={`btn btn-sm ${guestMode === 'generic' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGuestMode('generic')}>
              Sin datos del huésped
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
                <label className="form-label">Teléfono (opcional)</label>
                <input type="tel" className="form-control" minLength={3} maxLength={30} value={newGuest.phone} onChange={(e) => setNewGuest({ ...newGuest, phone: e.target.value })} />
              </div>
              <div className="col-sm-6">
                <label className="form-label">Email (opcional)</label>
                <input type="email" className="form-control" maxLength={200} value={newGuest.email} onChange={(e) => setNewGuest({ ...newGuest, email: e.target.value })} />
              </div>
            </div>
          ) : guestMode === 'generic' ? <p className="small text-secondary mb-0">Se crea una ficha propia como «Huésped genérico». Podés completar los datos después sin modificar otras reservas.</p> : (
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
                      {service.description && <div className="small text-secondary text-break mt-1" style={{ whiteSpace: 'pre-line' }}>{service.description}</div>}
                      {selected && (
                        <div className="d-flex align-items-center gap-2 mt-2 flex-wrap">
                          {service.chargeType === 'PACK' ? (
                            <>
                              <label className="form-label mb-0 small">Cant.</label>
                              <input
                                type="number"
                                min={1}
                                className="form-control form-control-sm w-auto"
                                style={{ width: 80 }}
                                value={selected.quantity}
                                onChange={(e) => setQuantity(service.id, Math.max(1, Number(e.target.value)))}
                              />
                              <span className="text-secondary small">· {CHARGE_TYPES[service.chargeType]}</span>
                            </>
                          ) : service.chargeType === 'PER_PERSON' ? (
                            <>
                              <label className="form-label mb-0 small">Personas</label>
                              <input
                                type="number"
                                min={1}
                                max={maxPersons()}
                                className="form-control form-control-sm w-auto"
                                style={{ width: 80 }}
                                value={selected.personsCovered ?? maxPersons()}
                                onChange={(e) =>
                                  setPersonsCovered(service.id, Math.max(1, Math.min(maxPersons(), Number(e.target.value || 1))))
                                }
                              />
                              {selected.personsCovered != null && (
                                <button type="button" className="btn btn-sm btn-link p-0 text-primary" onClick={() => setPersonsCovered(service.id, null)}>
                                  Todas
                                </button>
                              )}
                              <span className="text-secondary small">
                                {selected.personsCovered ?? maxPersons()} pers. × {nights()} noche(s) · {CHARGE_TYPES[service.chargeType]}
                              </span>
                            </>
                          ) : (
                            <span className="text-secondary small">
                              {selected.quantity} unidades ={' '}
                              {service.chargeType === 'PER_ROOM_INTERVAL'
                                ? serviceQuantityLabel({ ...service, quantity: selected.quantity }, { persons, nights: nights() }, selectedRooms.length)
                                : service.isExtraBed
                                ? `${Math.max(1, extraBeds)} cama(s) extra(s) × ${nights()} noche(s)`
                                : `${nights()} noche(s)`}{' '}
                              · {CHARGE_TYPES[service.chargeType]}
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
          <h3 className="section-title">4 · Cobro</h3>
          {!selectedRoom ? (
            <p className="text-secondary mb-0">Elegí una habitación para ver el total y cobrar un anticipo.</p>
          ) : (
            <>
              {canDiscount && <DiscountInput value={discount} subtotal={estimateSubtotal()} onChange={setDiscount} />}
              <div className="totals-box">
                {canDiscount && discount && <>
                  <div><span>Subtotal</span><strong>{money(estimateSubtotal())}</strong></div>
                  <div><span>Descuento{discount.type === 'PERCENTAGE' ? ` (${discount.value}%)` : ''}</span><strong className="text-success">−{money(discountPreview(estimateSubtotal(), discount))}</strong></div>
                </>}
                <div>
                  <span>Total de la reserva</span>
                  <strong>{money(estimateTotal())}</strong>
                </div>
                {depositMode !== 'none' && (
                  <>
                    <div>
                      <span>Anticipo</span>
                      <strong className="text-success">{money(resolvedDeposit())}</strong>
                    </div>
                    <div>
                      <span>Saldo</span>
                      <strong className={depositBalance() > 0 ? 'text-danger' : 'text-success'}>{money(depositBalance())}</strong>
                    </div>
                  </>
                )}
              </div>

              <div className="radio-list">
                <label className={`radio-item ${depositMode === 'none' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="deposit"
                    className="form-check-input"
                    checked={depositMode === 'none'}
                    onChange={() => selectDepositMode('none')}
                  />
                  <span className="flex-grow-1">
                    <strong>Sin anticipo</strong>
                  </span>
                </label>
                <label className={`radio-item ${depositMode === 'suggested' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="deposit"
                    className="form-check-input"
                    checked={depositMode === 'suggested'}
                    onChange={() => selectDepositMode('suggested')}
                  />
                  <span className="flex-grow-1">
                    <strong>15% de seña (sugerido)</strong> <span className="text-secondary">{money(suggestedDeposit())}</span>
                  </span>
                </label>
                <label className={`radio-item ${depositMode === 'custom' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="deposit"
                    className="form-check-input"
                    checked={depositMode === 'custom'}
                    onChange={() => selectDepositMode('custom')}
                  />
                  <span className="flex-grow-1">
                    <strong>Otro monto</strong>
                  </span>
                </label>
              </div>

              {depositMode !== 'none' && (
                <div className="filter-row mt-3">
                  {depositMode === 'custom' && (
                    <label className="field-inline">
                      <span className="form-label mb-0">Monto del anticipo *</span>
                      <input
                        type="number"
                        min={0.01}
                        max={estimateTotal()}
                        step="0.01"
                        className="form-control"
                        style={{ width: 140 }}
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        onBlur={() => setDepositAmount(String(clampAmount(Number(depositAmount), estimateTotal())))}
                        required
                      />
                    </label>
                  )}
                  <label className="field-inline">
                    <span className="form-label mb-0">Método</span>
                    <select
                      className="form-select"
                      value={depositMethod}
                      onChange={(e) => setDepositMethod(e.target.value as PaymentMethod)}
                    >
                      {DEPOSIT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {PAYMENT_METHODS[m]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              <div className="form-check form-switch mt-3">
                <input
                  id="mp-payment-link"
                  className="form-check-input"
                  type="checkbox"
                  checked={depositViaMp() || paymentLink}
                  disabled={DEMO_MODE || depositViaMp()}
                  onChange={(e) => setPaymentLink(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="mp-payment-link">
                  Cobrar con MercadoPago {DEMO_MODE && '(deshabilitado en demo)'}
                </label>
                <div className="text-secondary small">
                  {depositViaMp() ? (
                    <>
                      El link de pago se genera por la seña de {money(resolvedDeposit())}. El saldo de {money(depositBalance())} se
                      cobra en el hotel al check-in.
                    </>
                  ) : depositMode === 'none' ? (
                    'Se genera un link de pago por el total y la reserva queda en espera del pago confirmado.'
                  ) : (
                    <>
                      El link de MercadoPago se genera solo por el saldo de {money(depositBalance())} y la reserva queda en
                      espera de ese pago.
                    </>
                  )}
                </div>
              </div>
              {depositViaMp() ? (
                depositBalance() <= 0 && (
                  <p className="text-secondary small mb-0 mt-1">
                    La seña cubre el total, así que no queda saldo pendiente en el hotel.
                  </p>
                )
              ) : (
                paymentLink && depositBalance() <= 0 && (
                  <p className="text-secondary small mb-0 mt-1">
                    El anticipo cubre el total, así que no se genera link de pago: la reserva queda confirmada.
                  </p>
                )
              )}
            </>
          )}
        </div>

        <div className="form-section">
          <h3 className="section-title">5 · Notas</h3>
          <label className="form-label">Notas del huésped</label>
          <textarea className="form-control" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
        </div>
        </>}

        <div className="modal-actions">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || (independent && (selectedRooms.length === 0 || selectedRooms.length > 50))}>
            {saving ? 'Reservando…' : independent ? `Crear ${selectedRooms.length} ${selectedRooms.length === 1 ? 'reserva' : 'reservas'}` : 'Confirmar reserva'}
          </button>
        </div>
        </fieldset>
      </form>
    </Modal>
  );
}
