import type { BookingLink, CalendarData, CompanySettings, Guest, PaymentMethod, Reservation, ReservationStatus, Room, Service, Summary } from '../api/types.ts';
import { BOOKING_THEME_FIELDS, bookingThemeFromConfig, DEFAULT_BOOKING_THEME } from '../lib/bookingTheme.ts';
import { round2 } from '../lib/format.ts';
import { computeBookingDeposit, serviceQuantity } from '../lib/pricing.ts';
import { createDemoData, dayRange, demoUser, shiftDay, updateTotals, type DemoData } from './data.ts';

export class DemoApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = 'DEMO_VALIDATION') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Input = Record<string, unknown>;
const active = (reservation: Reservation) => reservation.status !== 'CANCELLED' && reservation.status !== 'CHECKED_OUT';
const overlaps = (reservation: Reservation, from: string, to: string) => reservation.checkIn < to && reservation.checkOut > from;
const nextId = (rows: { id: number }[]) => Math.max(0, ...rows.map((row) => row.id)) + 1;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const usesRoom = (reservation: Reservation, roomId: number) => reservation.roomId === roomId || reservation.rooms?.some((line) => line.roomId === roomId);

function requireRow<T extends { id: number }>(rows: T[], id: number): T {
  const row = rows.find((item) => item.id === id);
  if (!row) throw new DemoApiError('No encontramos ese registro en la demo.', 404, 'DEMO_NOT_FOUND');
  return row;
}

function dates(from: string, to: string, inclusive = false): void {
  const valid = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
  if (!valid(from) || !valid(to) || (inclusive ? from > to : from >= to)) throw new DemoApiError('Indicá un rango de fechas válido.');
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 365) throw new DemoApiError('La demo admite rangos de hasta 365 días.');
}

function positive(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new DemoApiError(`${label} debe ser mayor a cero.`);
  return number;
}

function page<T>(rows: T[], query: URLSearchParams) {
  const pageSize = Math.min(100, Math.max(1, Number(query.get('pageSize')) || 15));
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(totalPages, Math.max(1, Number(query.get('page')) || 1));
  return { data: rows.slice((current - 1) * pageSize, current * pageSize), meta: { page: current, pageSize, total: rows.length, totalPages } };
}

function summary(store: DemoData, from: string, to: string): Summary {
  dates(from, to, true);
  const days = dayRange(from, to);
  const rooms = store.rooms.filter((room) => room.isActive);
  const reservations = store.reservations;
  const daily = days.map((date) => {
    const occupied = rooms.filter((room) => reservations.some((r) => usesRoom(r, room.id) && r.status !== 'CANCELLED' && r.checkIn <= date && r.checkOut > date)).length;
    return {
      date, occupiedRoomNights: occupied, occupancyPct: rooms.length ? round2(occupied / rooms.length * 100) : 0,
      revenue: round2(reservations.flatMap((r) => r.payments).filter((p) => p.paidAt.slice(0, 10) === date).reduce((sum, p) => sum + p.amount, 0)),
      created: reservations.filter((r) => r.createdAt.slice(0, 10) === date).length,
      checkIns: reservations.filter((r) => r.checkedInAt?.slice(0, 10) === date).length,
      checkOuts: reservations.filter((r) => r.checkedOutAt?.slice(0, 10) === date).length,
    };
  });
  const byMethod: Record<string, number> = {};
  for (const payment of reservations.flatMap((r) => r.payments)) {
    if (payment.paidAt.slice(0, 10) < from || payment.paidAt.slice(0, 10) > to) continue;
    byMethod[payment.method] = round2((byMethod[payment.method] ?? 0) + payment.amount);
  }
  const occupiedRoomNights = daily.reduce((sum, day) => sum + day.occupiedRoomNights, 0);
  const totalRoomNights = rooms.length * days.length;
  const counts = new Map<ReservationStatus, number>();
  for (const r of reservations.filter((r) => overlaps(r, from, shiftDay(to, 1)))) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  return {
    range: { from, to, days: days.length }, daily,
    occupancy: { occupiedRoomNights, totalRoomNights, availableRoomNights: totalRoomNights - occupiedRoomNights, occupancyPct: totalRoomNights ? round2(occupiedRoomNights / totalRoomNights * 100) : 0 },
    revenue: { total: round2(Object.values(byMethod).reduce((sum, amount) => sum + amount, 0)), byMethod },
    reservationsPage: { created: daily.reduce((sum, d) => sum + d.created, 0), checkIns: daily.reduce((sum, d) => sum + d.checkIns, 0), checkOuts: daily.reduce((sum, d) => sum + d.checkOuts, 0) },
    statusDistribution: [...counts].map(([status, count]) => ({ status, count })),
  };
}

function calendar(store: DemoData, from: string, to: string): CalendarData {
  dates(from, to, true);
  const days = dayRange(from, to);
  return {
    from, to, days,
    rooms: store.rooms.filter((room) => room.isActive).map((room) => ({
      id: room.id, number: room.number, name: room.name, typeName: room.type?.name ?? null,
      cells: days.map((day) => {
        const refs = store.reservations.filter((r) => r.status !== 'CANCELLED' && usesRoom(r, room.id) && r.checkIn <= day && r.checkOut >= day);
        const occupied = refs.some((r) => r.checkIn <= day && r.checkOut > day);
        const turnover = refs.some((r) => r.checkIn === day) && refs.some((r) => r.checkOut === day);
        return {
          status: turnover ? 'TURNOVER' : occupied ? 'OCCUPIED' : 'AVAILABLE',
          reservations: refs.map((r) => ({ id: r.id, code: r.code, status: r.status, checkIn: r.checkIn, checkOut: r.checkOut, guestName: `${r.guest?.firstName} ${r.guest?.lastName}` })),
        };
      }),
    })),
  };
}

export function createDemoApi(today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })) {
  const store = createDemoData(today);
  let paymentId = 1000;
  const company: CompanySettings = {
    id: 1, name: demoUser.companyName, whatsapp: null, phone: null, bookingDepositPercent: 20,
    bookingSlug: 'hotel-aurora-demo', configPage: { bookingTheme: { ...DEFAULT_BOOKING_THEME }, maxAvailabilityPersons: null },
    hotelCapacity: 0, maxAvailabilityPersons: 0,
  };
  const links: BookingLink[] = [];
  const offers = new Map<number, ReturnType<typeof quoteStay>>();

  function validateStay(input: Input) {
    const checkIn = text(input.checkIn);
    const checkOut = text(input.checkOut);
    dates(checkIn, checkOut);
    if (checkIn < today) throw new DemoApiError('La entrada no puede ser anterior a hoy.');
    const selections = (input.rooms ?? [{ roomId: input.roomId, persons: input.persons, extraBeds: input.extraBeds }]) as Input[];
    if (!Array.isArray(selections) || !selections.length || new Set(selections.map((line) => Number(line.roomId))).size !== selections.length) throw new DemoApiError('Seleccioná habitaciones sin repetir.');
    const nights = (Date.parse(checkOut) - Date.parse(checkIn)) / 86400000;
    const rooms = selections.map((line) => {
      const room = requireRow(store.rooms, Number(line.roomId));
      if (!room.isActive || store.reservations.some((r) => active(r) && usesRoom(r, room.id) && overlaps(r, checkIn, checkOut))) throw new DemoApiError('La habitación ya está ocupada para esas fechas.', 409, 'ROOM_CONFLICT');
      const persons = positive(line.persons, 'La cantidad de personas');
      const extraBeds = Number(line.extraBeds ?? 0);
      if (!Number.isInteger(persons) || persons > room.capacity || !Number.isInteger(extraBeds) || extraBeds < 0 || extraBeds > room.maxExtraBeds || (extraBeds > 0 && persons < room.capacity)) throw new DemoApiError('La cantidad de personas o camas extra no es válida.');
      return { roomId: room.id, room, persons, extraBeds, roomPrice: room.price, roomPricingMode: room.pricingMode, total: round2(room.price * nights * (room.pricingMode === 'PER_PERSON' ? persons : 1)) };
    });
    return { checkIn, checkOut, room: rooms[0].room, rooms, persons: rooms.reduce((sum, line) => sum + line.persons, 0), extraBeds: rooms.reduce((sum, line) => sum + line.extraBeds, 0), nights };
  }

  function quoteStay(input: Input) {
    const stay = validateStay(input);
    const lines = ((input.services ?? []) as Input[]).map((line, index) => {
      const service = requireRow(store.services, Number(line.serviceId));
      if (!service.isActive) throw new DemoApiError('El servicio está inactivo.');
      const quantity = service.chargeType === 'PER_ROOM_INTERVAL'
        ? serviceQuantity(service.chargeType, { persons: stay.persons, extraBeds: stay.extraBeds, nights: stay.nights, roomCount: stay.rooms.length }, undefined, false, service.intervalDays)
        : positive(line.quantity, 'La cantidad del servicio');
      return { id: index + 1, serviceId: service.id, name: service.name, description: service.description ?? null, intervalDays: service.intervalDays ?? null, chargeType: service.chargeType, isExtraBed: service.isExtraBed, personsCovered: line.personsCovered == null ? null : Number(line.personsCovered), quantity, unitPrice: service.price, lineTotal: round2(quantity * service.price) };
    });
    const roomTotal = round2(stay.rooms.reduce((sum, line) => sum + line.total, 0));
    const servicesTotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
    return { ...stay, lines, roomTotal, servicesTotal, total: round2(roomTotal + servicesTotal) };
  }

  function addPayment(reservation: Reservation, input: Input) {
    const amount = round2(positive(input.amount, 'El importe'));
    if (amount <= 0) throw new DemoApiError('El importe mínimo es $0,01.');
    const method = text(input.method) as PaymentMethod;
    if (!['CASH', 'CARD', 'TRANSFER'].includes(method)) throw new DemoApiError('Los cobros online están deshabilitados en la demo.', 403, 'DEMO_EXTERNAL_DISABLED');
    if (amount > reservation.totals.balance) throw new DemoApiError('El pago no puede superar el saldo pendiente.');
    if (reservation.status === 'CANCELLED' || reservation.status === 'CHECKED_OUT') throw new DemoApiError('La reserva no admite pagos en este estado.', 409);
    if (reservation.source === 'PUBLIC_LINK' && reservation.status === 'PENDING') throw new DemoApiError('Primero aprobá o rechazá la solicitud.', 409);
    reservation.payments.push({ id: paymentId++, amount, method, reference: text(input.reference) || null, paidAt: `${today}T15:00:00Z` });
    updateTotals(reservation);
    if (reservation.status === 'PENDING') reservation.status = 'RESERVED';
  }

  function createReservation(input: Input, frozen?: ReturnType<typeof quoteStay>) {
    if (input.generatePaymentLink || (input.payment as Input | undefined)?.method === 'MERCADOPAGO') {
      throw new DemoApiError('MercadoPago está deshabilitado en la demo. Usá efectivo, tarjeta o transferencia simulados.', 403, 'DEMO_EXTERNAL_DISABLED');
    }
    if (frozen) validateStay(input);
    const { checkIn, checkOut, room, rooms, persons, extraBeds, nights, lines, roomTotal, servicesTotal, total } = frozen ?? quoteStay(input);
    const payment = input.payment as Input | undefined;
    if (payment && (round2(positive(payment.amount, 'El anticipo')) <= 0 || round2(Number(payment.amount)) > total || !['CASH', 'CARD', 'TRANSFER'].includes(text(payment.method)))) throw new DemoApiError('El anticipo o el método de pago no es válido.');
    let guest: Guest;
    if (input.guestId) guest = requireRow(store.guests, Number(input.guestId));
    else {
      const draft = input.guest as Input | undefined;
      if (!draft || !text(draft.firstName) || !text(draft.lastName) || !text(draft.phone) || !text(draft.email)) throw new DemoApiError('Completá los datos del huésped.');
      guest = { id: nextId(store.guests), firstName: text(draft.firstName), lastName: text(draft.lastName), phone: text(draft.phone), email: text(draft.email) };
      store.guests.push(guest);
    }
    const id = nextId(store.reservations);
    const reservation: Reservation & { createdAt: string } = {
      id, code: `RSV-DEMO${String(id).padStart(4, '0')}`, roomId: room.id, guestId: guest.id,
      checkIn, checkOut, persons, extraBeds, status: 'PENDING', source: 'STAFF', checkedInAt: null, checkedOutAt: null,
      cancelledAt: null, refundEligible: false, refundAmount: null, refunded: false, refundedAt: null,
      notes: text(input.notes) || null, room: structuredClone(room), rooms: structuredClone(rooms), guest, services: structuredClone(lines), payments: [],
      createdAt: `${today}T15:00:00Z`,
      totals: { nights, roomPrice: room.price, roomTotal, servicesTotal, total, amountPaid: 0, balance: total },
    };
    if (payment) addPayment(reservation, payment);
    store.reservations.push(reservation);
    return { data: reservation };
  }

  function route(path: string, options: { method?: string; body?: unknown }) {
    const url = new URL(path, 'https://demo.invalid');
    const pathname = url.pathname;
    const query = url.searchParams;
    const method = options.method ?? 'GET';
    const input = (options.body ?? {}) as Input;
    const hotelCapacity = store.rooms.filter((room) => room.isActive).reduce((sum, room) => sum + room.capacity, 0);
    const hotel = { name: company.name, whatsapp: company.whatsapp, phone: company.phone, bookingTheme: bookingThemeFromConfig(company.configPage) };
    if (pathname === '/companies/current' && (method === 'GET' || method === 'PATCH')) {
      if (method === 'PATCH') {
        const updated = structuredClone(company);
        for (const key of Object.keys(input)) {
          if (!['whatsapp', 'phone', 'bookingDepositPercent', 'bookingSlug', 'configPage'].includes(key)) throw new DemoApiError('Ese ajuste no está disponible en la demo.');
        }
        for (const key of ['whatsapp', 'phone', 'bookingSlug'] as const) {
          if (!(key in input)) continue;
          if (input[key] !== null && typeof input[key] !== 'string') throw new DemoApiError('Indicá un texto válido para el contacto o identificador.');
          const value = text(input[key]);
          if (value.length > (key === 'bookingSlug' ? 60 : 30) || (key === 'bookingSlug' && value && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))) throw new DemoApiError('El contacto o identificador no es válido.');
          updated[key] = value || null;
        }
        if ('bookingDepositPercent' in input) {
          const percent = input.bookingDepositPercent;
          if (typeof percent !== 'number' || !Number.isInteger(percent) || percent < 0 || percent > 100) throw new DemoApiError('El anticipo debe ser un entero entre 0 y 100.');
          updated.bookingDepositPercent = percent;
        }
        if ('configPage' in input) {
          const config = input.configPage as Input;
          if (!config || typeof config !== 'object' || Array.isArray(config) || Object.keys(config).some((key) => !['bookingTheme', 'maxAvailabilityPersons'].includes(key))) throw new DemoApiError('La configuración de la página no es válida.');
          if ('bookingTheme' in config) {
            const theme = config.bookingTheme as Input;
            if (!theme || typeof theme !== 'object' || BOOKING_THEME_FIELDS.some(({ key }) => typeof theme[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(theme[key] as string))) throw new DemoApiError('Usá colores en formato hexadecimal #RRGGBB.');
            updated.configPage.bookingTheme = bookingThemeFromConfig({ bookingTheme: theme });
          }
          if ('maxAvailabilityPersons' in config) {
            const max = config.maxAvailabilityPersons;
            if (max !== null && (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > hotelCapacity)) throw new DemoApiError('El máximo de personas debe estar dentro de la capacidad del hotel.');
            updated.configPage.maxAvailabilityPersons = max as number | null;
          }
        }
        Object.assign(company, updated);
      }
      return { data: { ...company, hotelCapacity, maxAvailabilityPersons: Math.min(company.configPage.maxAvailabilityPersons ?? hotelCapacity, hotelCapacity) } };
    }
    if (method === 'GET' && pathname === '/booking-links') return { data: links.filter((link) => !query.get('status') || link.status === query.get('status')).toReversed() };
    if (method === 'POST' && pathname === '/booking-links') {
      const offer = structuredClone(quoteStay(input));
      const deposit = input.deposit === undefined ? computeBookingDeposit(offer.total, company.bookingDepositPercent) : round2(Number(input.deposit));
      if (!Number.isFinite(deposit) || deposit < 0 || deposit > offer.total) throw new DemoApiError('El anticipo debe estar entre cero y el total.');
      const days = Number(input.expiresInDays ?? 15);
      if (!Number.isInteger(days) || days < 1 || days > 365) throw new DemoApiError('El vencimiento debe ser de 1 a 365 días.');
      const id = nextId(links);
      const token = `demo-solicitud-${id}`;
      const url = `/reserva/${token}`;
      const link: BookingLink = {
        id, token, url, status: 'OPEN', checkIn: offer.checkIn, checkOut: offer.checkOut, nights: offer.nights,
        persons: offer.persons, extraBeds: offer.extraBeds,
        rooms: offer.rooms.map((line) => ({ roomId: line.roomId, persons: line.persons, extraBeds: line.extraBeds, roomPrice: line.roomPrice, roomPricingMode: line.roomPricingMode, number: line.room.number, typeName: line.room.type?.name ?? 'Habitación', capacity: line.room.capacity })),
        room: { ...offer.room, typeName: offer.room.type?.name ?? null, label: `${offer.room.number} · ${offer.room.type?.name ?? ''}` },
        services: offer.lines.map((line) => ({ ...line, name: line.name ?? '', chargeType: line.chargeType! })),
        totals: { roomTotal: offer.roomTotal, servicesTotal: offer.servicesTotal, total: offer.total, deposit, balance: round2(offer.total - deposit) },
        expiresAt: `${shiftDay(today, days)}T23:59:59Z`, createdAt: `${today}T15:00:00Z`, completedAt: null, reservation: null,
        share: { message: `¡Hola! Te compartimos tu estadía en ${hotel.name}: ${offer.checkIn} al ${offer.checkOut}. Total: $${offer.total}. Anticipo: $${deposit}. Completá tus datos en ${url}. Mensaje de demostración: no transferir dinero.`, whatsappUrl: '' },
      };
      offers.set(id, offer);
      links.push(link);
      return { data: link };
    }
    const cancelLink = pathname.match(/^\/booking-links\/(\d+)\/cancel$/);
    if (method === 'POST' && cancelLink) {
      const link = requireRow(links, Number(cancelLink[1]));
      if (link.status !== 'OPEN') throw new DemoApiError('La solicitud ya no está abierta.', 409);
      link.status = 'CANCELLED';
      return { data: link };
    }
    const publicLink = pathname.match(/^\/public\/booking\/([^/]+)$/);
    if (publicLink && ['GET', 'POST'].includes(method)) {
      const link = links.find((item) => item.token === publicLink[1]);
      if (!link) throw new DemoApiError('No encontramos esta solicitud. Creala desde Reservas por WhatsApp en esta pestaña.', 404);
      if (link.status !== 'OPEN') throw new DemoApiError('Esta solicitud ya fue enviada o anulada.', 409, 'LINK_UNAVAILABLE');
      const expired = !!link.expiresAt && link.expiresAt.slice(0, 10) < today;
      if (method === 'GET') return { data: {
        hotel, stay: { checkIn: link.checkIn, checkOut: link.checkOut, nights: link.nights, persons: link.persons, extraBeds: link.extraBeds, roomType: link.room?.typeName ?? 'Habitación', roomCapacity: link.room?.capacity, roomPricingMode: link.room?.pricingMode, rooms: offers.get(link.id)!.rooms.map((line) => ({ roomType: line.room.type?.name ?? 'Habitación', capacity: line.room.capacity, persons: line.persons, extraBeds: line.extraBeds, total: line.total })) },
        services: link.services, totals: link.totals, expiresAt: link.expiresAt, expired,
      } };
      if (expired) throw new DemoApiError('La solicitud venció.', 409, 'LINK_EXPIRED');
      if (link.totals.deposit > 0 && input.receiptPath !== 'demo-comprobante') throw new DemoApiError('Usá el comprobante ficticio de la demo.');
      const reservation = createReservation({ roomId: link.room!.id, rooms: link.rooms, checkIn: link.checkIn, checkOut: link.checkOut, persons: link.persons, extraBeds: link.extraBeds, guest: input, notes: input.notes }, offers.get(link.id)).data;
      reservation.source = 'PUBLIC_LINK';
      reservation.bookingLink = { id: link.id, token: link.token, status: 'COMPLETED', deposit: link.totals.deposit, expiresAt: link.expiresAt };
      if (link.totals.deposit > 0) reservation.receipt = { id: reservation.id, fileName: 'comprobante-demo.svg', mimeType: 'image/svg+xml', size: 600, externalRef: text(input.externalRef) || 'DEMO-SIN-VALOR', createdAt: `${today}T15:00:00Z` };
      link.status = 'COMPLETED';
      link.completedAt = `${today}T15:00:00Z`;
      link.reservation = { id: reservation.id, code: reservation.code, status: reservation.status };
      return { data: { code: reservation.code, total: link.totals.total, deposit: link.totals.deposit, hotel } };
    }
    const catalog = pathname.match(/^\/(rooms|room-types|services|guests)(?:\/(\d+))?$/);
    if (catalog && ['POST', 'PUT', 'DELETE'].includes(method)) {
      const kind = catalog[1];
      const id = Number(catalog[2]);
      if ((method === 'POST' && id) || (method !== 'POST' && !id) || (kind === 'guests' && method === 'DELETE')) throw new DemoApiError('Operación no disponible.', 403);
      const rows = kind === 'rooms' ? store.rooms : kind === 'room-types' ? store.roomTypes : kind === 'services' ? store.services : store.guests;
      const existing = method === 'POST' ? null : requireRow<{ id: number }>(rows, id);
      if (method === 'DELETE') {
        const used = kind === 'rooms' ? store.reservations.some((r) => usesRoom(r, id)) || links.some((l) => l.room?.id === id || l.rooms?.some((line) => line.roomId === id))
          : kind === 'room-types' ? store.rooms.some((r) => r.typeId === id)
          : store.reservations.some((r) => r.services.some((s) => s.serviceId === id)) || links.some((l) => l.services.some((s) => s.serviceId === id));
        if (used) throw new DemoApiError('El registro está en uso. Podés editarlo o desactivarlo en lugar de eliminarlo.', 409);
        rows.splice(rows.findIndex((row) => row.id === id), 1);
        return { data: { id } };
      }
      const values = { ...(existing ?? {}), ...input } as Input;
      const rowId = existing?.id ?? nextId(rows);
      let saved: { id: number };
      const name = text(values.name);
      if (kind === 'rooms') {
        const type = requireRow(store.roomTypes, Number(values.typeId));
        const number = text(values.number);
        const capacity = positive(values.capacity, 'La capacidad');
        const maxExtraBeds = Number(values.maxExtraBeds ?? 0);
        const price = Number(values.price);
        if (!number || !Number.isInteger(capacity) || !Number.isInteger(maxExtraBeds) || maxExtraBeds < 0 || !Number.isFinite(price) || price < 0 || !['PER_NIGHT', 'PER_PERSON'].includes(text(values.pricingMode))) throw new DemoApiError('Completá los datos válidos de la habitación.');
        if (store.rooms.some((r) => r.id !== rowId && r.number === number)) throw new DemoApiError('Ya existe una habitación con ese número.', 409);
        if (!Array.isArray(values.amenities) || values.amenities.some((a) => typeof a !== 'string')) throw new DemoApiError('Los amenities no son válidos.');
        saved = { id: rowId, number, name: name || null, typeId: type.id, type, capacity, maxExtraBeds, price: round2(price), pricingMode: values.pricingMode, amenities: values.amenities, isActive: values.isActive !== false } as Room;
      } else if (kind === 'services') {
        const price = Number(values.price);
        const description = text(values.description) || null;
        const intervalDays = values.intervalDays == null ? null : Number(values.intervalDays);
        if (!name || !Number.isFinite(price) || price < 0 || !['PER_PERSON', 'PER_DAY', 'PACK', 'PER_ROOM_INTERVAL'].includes(text(values.chargeType)) || (description && description.length > 1000)) throw new DemoApiError('Completá los datos válidos del servicio.');
        if (values.chargeType === 'PER_ROOM_INTERVAL' ? !Number.isInteger(intervalDays) || intervalDays! < 1 || intervalDays! > 365 || values.isExtraBed === true : intervalDays !== null) throw new DemoApiError('La frecuencia del servicio no es válida.');
        saved = { id: rowId, name, description, intervalDays, price: round2(price), chargeType: values.chargeType, isExtraBed: values.isExtraBed === true, isActive: values.isActive !== false } as Service;
      } else if (kind === 'room-types') {
        if (!name) throw new DemoApiError('Indicá el nombre del tipo de habitación.');
        if (store.roomTypes.some((t) => t.id !== rowId && t.name.toLowerCase() === name.toLowerCase())) throw new DemoApiError('Ya existe ese tipo de habitación.', 409);
        saved = { id: rowId, name } as typeof store.roomTypes[number];
      } else {
        if (!text(values.firstName) || !text(values.lastName) || !text(values.phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(values.email))) throw new DemoApiError('Completá los datos y un email válido del huésped.');
        saved = { id: rowId, firstName: text(values.firstName), lastName: text(values.lastName), phone: text(values.phone), email: text(values.email) } as Guest;
      }
      if (existing) Object.assign(existing, saved);
      else (rows as { id: number }[]).push(saved);
      return { data: saved };
    }
    if (method === 'GET' && pathname === '/auth/me') return { user: demoUser };
    if (method === 'POST' && pathname === '/auth/logout') return { ok: true };
    if (method === 'GET' && pathname === '/summary') return { data: summary(store, query.get('from') ?? `${today.slice(0, 7)}-01`, query.get('to') ?? today) };
    if (method === 'GET' && pathname === '/calendar') return { data: calendar(store, query.get('from') ?? today, query.get('to') ?? shiftDay(today, 30)) };
    if (method === 'GET' && pathname === '/rooms/available') {
      const from = query.get('checkIn') ?? '';
      const to = query.get('checkOut') ?? '';
      dates(from, to);
      return { data: store.rooms.filter((room) => room.isActive && (!query.get('typeId') || room.typeId === Number(query.get('typeId'))) && !store.reservations.some((r) => active(r) && usesRoom(r, room.id) && overlaps(r, from, to))) };
    }
    if (method === 'GET' && pathname === '/reservations') {
      const search = (query.get('search') ?? '').toLowerCase();
      const status = query.get('status');
      const rows = store.reservations.filter((r) => {
        const matchesStatus = !status || (status === 'active' ? active(r) : r.status === status);
        return matchesStatus && (!query.get('source') || r.source === query.get('source')) &&
          (!query.get('from') || r.checkOut > query.get('from')!) && (!query.get('to') || r.checkIn <= query.get('to')!) &&
          `${r.code} ${r.guest?.firstName} ${r.guest?.lastName} ${r.room?.number} ${r.rooms?.map((line) => line.room?.number).join(' ') ?? ''}`.toLowerCase().includes(search);
      }).sort((a, b) => b.id - a.id);
      return page(rows, query);
    }
    if (method === 'POST' && pathname === '/reservations') return createReservation(input);
    const reservationMatch = pathname.match(/^\/reservations\/(\d+)(?:\/(.+))?$/);
    if (reservationMatch) {
      const reservation = requireRow(store.reservations, Number(reservationMatch[1]));
      const action = reservationMatch[2];
      if (method === 'GET' && !action) return { data: reservation };
      if (method === 'GET' && action === 'receipt' && reservation.receipt) {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="300"><rect width="100%" height="100%" fill="#eef2ff"/><text x="40" y="90" font-size="28">Comprobante ficticio · DEMO</text><text x="40" y="150" font-size="22">Sin valor fiscal. No se transfirió dinero.</text></svg>';
        return { data: { ...reservation.receipt, url: `data:image/svg+xml,${encodeURIComponent(svg)}` } };
      }
      if (method === 'POST' && (action === 'approve' || action === 'reject')) {
        if (reservation.source !== 'PUBLIC_LINK' || reservation.status !== 'PENDING') throw new DemoApiError('La solicitud ya no está pendiente de verificación.', 409, 'INVALID_STATE');
        if (action === 'approve') {
          reservation.status = 'RESERVED';
          const deposit = reservation.bookingLink?.deposit ?? 0;
          if (deposit > 0) addPayment(reservation, { amount: deposit, method: 'TRANSFER', reference: `FORM-${reservation.bookingLink!.token}` });
        } else {
          reservation.status = 'CANCELLED';
          reservation.cancelledAt = `${today}T15:00:00Z`;
          reservation.notes = [reservation.notes, `Rechazada: ${text(input.reason) || 'Comprobante no acreditado (demo)'}`].filter(Boolean).join('\n');
        }
        const link = links.find((l) => l.id === reservation.bookingLink?.id);
        if (link?.reservation) link.reservation.status = reservation.status;
        return { data: reservation };
      }
      if (method === 'POST' && action === 'payments') {
        addPayment(reservation, input);
        return { data: reservation };
      }
      const transitions: Record<string, { from: ReservationStatus[]; to: ReservationStatus }> = {
        'check-in': { from: ['RESERVED'], to: 'CHECKED_IN' },
        'check-out': { from: ['CHECKED_IN'], to: 'CHECKED_OUT' },
        cancel: { from: ['PENDING', 'RESERVED'], to: 'CANCELLED' },
      };
      if (method === 'POST' && action && transitions[action]) {
        const transition = transitions[action];
        if (!transition.from.includes(reservation.status)) throw new DemoApiError('La reserva no admite esa acción en su estado actual.', 409);
        if (action === 'check-in' && reservation.checkIn > today) throw new DemoApiError('El check-in todavía no está disponible.', 409);
        if (action === 'check-out' && reservation.totals.balance > 0) throw new DemoApiError('Registrá el saldo pendiente antes del check-out.', 409);
        reservation.status = transition.to;
        const link = links.find((item) => item.id === reservation.bookingLink?.id);
        if (link?.reservation) link.reservation.status = reservation.status;
        if (action === 'check-in') reservation.checkedInAt = `${today}T14:00:00Z`;
        if (action === 'check-out') reservation.checkedOutAt = `${today}T14:00:00Z`;
        if (action === 'cancel') reservation.cancelledAt = `${today}T14:00:00Z`;
        return { data: reservation };
      }
    }
    if (method === 'GET' && pathname === '/rooms') {
      const search = (query.get('search') ?? '').toLowerCase();
      return page(store.rooms.filter((r) => `${r.number} ${r.name ?? ''} ${r.type?.name}`.toLowerCase().includes(search)).map((r) => ({ ...r, _count: { reservations: store.reservations.filter((item) => usesRoom(item, r.id)).length } })), query);
    }
    if (method === 'GET' && pathname === '/room-types') return { data: store.roomTypes.map((type) => ({ ...type, _count: { rooms: store.rooms.filter((r) => r.typeId === type.id).length } })) };
    if (method === 'GET' && pathname === '/services') return { data: store.services };
    if (method === 'GET' && pathname === '/guests') {
      const search = (query.get('q') ?? '').toLowerCase();
      return page(store.guests.filter((g) => `${g.firstName} ${g.lastName} ${g.email} ${g.phone}`.toLowerCase().includes(search)).map((g) => ({ ...g, _count: { reservations: store.reservations.filter((r) => r.guestId === g.id).length } })), query);
    }
    const guestMatch = pathname.match(/^\/guests\/(\d+)$/);
    if (method === 'GET' && guestMatch) {
      const guest = requireRow(store.guests, Number(guestMatch[1]));
      return { data: { ...guest, reservations: store.reservations.filter((r) => r.guestId === guest.id) } };
    }
    throw new DemoApiError('Esta operación no está disponible en la demo. No se realizó ninguna conexión externa.', 403, 'DEMO_OPERATION_DISABLED');
  }

  return <T>(path: string, options: { method?: string; body?: unknown } = {}): T => structuredClone(route(path, options)) as T;
}

export const handleDemoRequest = createDemoApi();
