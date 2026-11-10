import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoApi, DemoApiError } from '../src/demo/api.ts';
import type { BookingLink, CalendarData, CompanySettings, Guest, Page, PublicBookingQuote, Reservation, ReservationReceiptDetail, Room, RoomType, Service, Summary, User } from '../src/api/types.ts';
import { bookingThemeFromConfig, bookingThemeStyle, DEFAULT_BOOKING_THEME } from '../src/lib/bookingTheme.ts';
import { buildIndependentReservations, emptyIndependentDetails } from '../src/lib/reservationBatch.ts';

const TODAY = '2026-10-26';
const stay = { checkIn: '2026-12-01', checkOut: '2026-12-04' };
const draft = { ...stay, roomId: 1, persons: 2, guestId: 1, services: [] };

test('carga cuatro dormis por una noche con huéspedes genéricos y cobros independientes', () => {
  const api = createDemoApi(TODAY);
  const rooms = api<{ data: Room[] }>('/rooms/available?checkIn=2026-12-01&checkOut=2026-12-02').data.slice(0, 4);
  assert.equal(rooms.length, 4);
  const selections = rooms.map((room) => ({ room, persons: room.capacity, extraBeds: 0 }));
  const details = { [rooms[0].id]: { ...emptyIndependentDetails(), paymentMode: 'full' as const }, [rooms[1].id]: { ...emptyIndependentDetails(), firstName: 'Ana', lastName: 'Pérez', paymentMode: 'custom' as const, amount: '1000', method: 'TRANSFER' as const } };
  const reservations = buildIndependentReservations(selections, '2026-12-01', '2026-12-02', details);
  const created = api<{ data: Reservation[] }>('/reservations/batch', { method: 'POST', body: { reservations } }).data;
  assert.equal(created.length, 4);
  assert.equal(new Set(created.map((row) => row.guestId)).size, 4);
  assert.equal(new Set(created.map((row) => row.code)).size, 4);
  assert.equal(created[0].guest?.firstName, 'Huésped');
  assert.equal(created[0].totals.balance, 0);
  assert.equal(created[1].guest?.firstName, 'Ana');
  assert.equal(created[1].totals.amountPaid, 1000);
  assert.equal(created[2].totals.amountPaid, 0);
  assert.ok(created.every((row) => row.totals.nights === 1 && row.rooms?.length === 1));
  api(`/guests/${created[0].guestId}`, { method: 'PUT', body: { firstName: 'Juan', lastName: 'Gómez' } });
  const other = api<{ data: Reservation }>(`/reservations/${created[2].id}`).data;
  assert.equal(other.guest?.firstName, 'Huésped');
});

test('si un dormi entra en conflicto no quedan reservas, huéspedes ni cobros parciales', () => {
  const api = createDemoApi(TODAY);
  const before = api<{ data: Guest[]; meta: { total: number } }>('/guests').meta.total;
  const reservations = [{ ...draft, guestId: undefined, genericGuest: true, payment: { amount: 1000, method: 'CASH' } }, { ...draft, genericGuest: true, guestId: undefined }];
  assert.throws(() => api('/reservations/batch', { method: 'POST', body: { reservations } }), DemoApiError);
  assert.equal(api<{ meta: { total: number } }>('/guests').meta.total, before);
  const retry = api<{ data: Reservation }>('/reservations', { method: 'POST', body: draft }).data;
  assert.equal(retry.roomId, draft.roomId);
});

test('la carga independiente valida fechas, nombres incompletos e importes antes de enviar', () => {
  const api = createDemoApi(TODAY);
  const room = api<{ data: Room[] }>('/rooms/available?checkIn=2026-12-01&checkOut=2026-12-02').data[0];
  const selections = [{ room, persons: 2, extraBeds: 0 }];
  assert.throws(() => buildIndependentReservations(selections, '2026-12-02', '2026-12-01', {}));
  assert.throws(() => buildIndependentReservations(selections, '2026-12-01', '2026-12-02', { [room.id]: { ...emptyIndependentDetails(), firstName: 'Ana' } }));
  assert.throws(() => buildIndependentReservations(selections, '2026-12-01', '2026-12-02', { [room.id]: { ...emptyIndependentDetails(), paymentMode: 'custom', amount: '999999999' } }));
});

test('la cotización independiente incluye camas extra y distingue tarifas por persona y por noche', () => {
  const api = createDemoApi(TODAY);
  const room = api<{ data: Room[] }>('/rooms/available?checkIn=2026-12-01&checkOut=2026-12-02').data[0];
  const extraBedService = { id: 999, price: 5000, chargeType: 'PER_DAY', isExtraBed: true } as Service;
  const selections = [
    { room: { ...room, price: 10000, pricingMode: 'PER_NIGHT' as const }, persons: 3, extraBeds: 1 },
    { room: { ...room, id: 999, price: 2000, pricingMode: 'PER_PERSON' as const }, persons: 4, extraBeds: 0 },
  ];
  const reservations = buildIndependentReservations(selections, '2026-12-01', '2026-12-03', { [room.id]: { ...emptyIndependentDetails(), paymentMode: 'full' } }, extraBedService);
  assert.equal(reservations[0].payment?.amount, 30000);
  assert.deepEqual(reservations[0].services, [{ serviceId: 999, quantity: 2 }]);
  assert.equal(reservations[1].payment, undefined);
  assert.deepEqual(reservations[1].services, []);
});

test('descuento porcentual manual conserva subtotal, calcula el anticipo y descuenta los pagos del total neto', () => {
  const api = createDemoApi(TODAY);
  const created = api<{ data: Reservation }>('/reservations', { method: 'POST', body: { ...draft, discount: { type: 'PERCENTAGE', value: 10 }, payment: { amount: 20000, method: 'TRANSFER' } } }).data;
  assert.equal(created.totals.subtotal, 204000);
  assert.equal(created.totals.roomTotal, 204000);
  assert.equal(created.totals.discountAmount, 20400);
  assert.equal(created.totalAmount, 183600);
  assert.equal(created.totals.balance, 163600);
  assert.deepEqual(created.discount, { type: 'PERCENTAGE', value: 10 });
});

test('el descuento fijo del link permanece congelado al cambiar precios y aprobar la reserva', () => {
  const api = createDemoApi(TODAY);
  const link = makeLink(api, { discount: { type: 'FIXED', value: 24000 } });
  const quote = api<{ data: PublicBookingQuote }>(`/public/booking/${link.token}`).data;
  assert.equal(quote.totals.subtotal, 204000);
  assert.equal(quote.totals.discountAmount, 24000);
  assert.equal(quote.totals.total, 180000);
  assert.deepEqual(quote.discount, { type: 'FIXED', value: 24000 });
  api('/rooms/1', { method: 'PUT', body: { price: 999999 } });
  const reservation = submitLink(api, link);
  assert.equal(reservation.totals.total, 180000);
  assert.equal(reservation.totals.discountAmount, 24000);
  const approved = api<{ data: Reservation }>(`/reservations/${reservation.id}/approve`, { method: 'POST' }).data;
  assert.equal(approved.totals.amountPaid, link.totals.deposit);
  assert.equal(approved.totals.balance, 180000 - link.totals.deposit);
});

test('rechaza descuentos inválidos sin crear una reserva ni ocupar habitaciones', () => {
  const api = createDemoApi(TODAY);
  for (const discount of [{ type: 'FIXED', value: 204000.01 }, { type: 'PERCENTAGE', value: 101 }, { type: 'FIXED', value: -1 }]) {
    assert.throws(() => api('/reservations', { method: 'POST', body: { ...draft, discount } }), DemoApiError);
  }
  const created = api<{ data: Reservation }>('/reservations', { method: 'POST', body: { ...draft, discount: { type: 'PERCENTAGE', value: 100 } } }).data;
  assert.equal(created.totalAmount, 0);
  assert.equal(created.depositRequired, 0);
});

test('guarda el anticipo ingresado sin reemplazarlo por el automático ni cambiarlo con pagos posteriores', () => {
  const api = createDemoApi(TODAY);
  const created = api<{ data: Reservation }>('/reservations', { method: 'POST', body: { ...draft, payment: { amount: 7500, method: 'TRANSFER' } } }).data;
  assert.equal(created.totalAmount, 204000);
  assert.equal(created.depositRequired, 7500);
  assert.equal(created.totals.amountPaid, 7500);
  api('/companies/current', { method: 'PATCH', body: { bookingDepositPercent: 80 } });
  api('/rooms/1', { method: 'PUT', body: { price: 999999 } });
  const paid = api<{ data: Reservation }>(`/reservations/${created.id}/payments`, { method: 'POST', body: { amount: 30000, method: 'CASH' } }).data;
  assert.equal(paid.totalAmount, created.totalAmount);
  assert.equal(paid.depositRequired, created.depositRequired);
  assert.equal(paid.totals.total, created.totalAmount);
  assert.equal(paid.totals.balance, 166500);
});

test('copia los importes del link incluso con anticipo manual cero y nueva configuración', () => {
  const api = createDemoApi(TODAY);
  const link = makeLink(api, { deposit: 0 });
  api('/companies/current', { method: 'PATCH', body: { bookingDepositPercent: 80 } });
  const reservation = submitLink(api, link);
  assert.equal(reservation.totalAmount, link.totals.total);
  assert.equal(reservation.depositRequired, 0);
});

test('reserva manual y ficha de huésped admiten solo nombre y apellido sin compartir homónimos', () => {
  const api = createDemoApi(TODAY);
  const name = { firstName: 'Juan', lastName: 'Pérez' };
  const first = api<{ data: Reservation }>('/reservations', { method: 'POST', body: { ...stay, roomId: 1, persons: 2, guest: name } }).data;
  const second = api<{ data: Reservation }>('/reservations', { method: 'POST', body: { ...stay, roomId: 2, persons: 2, guest: name } }).data;
  assert.equal(first.guest?.email, null);
  assert.equal(first.guest?.phone, null);
  assert.notEqual(first.guestId, second.guestId);
  const third = api<{ data: Guest }>('/guests', { method: 'POST', body: name }).data;
  assert.notEqual(third.id, first.guestId);
  assert.equal(third.email, null);
  assert.equal(third.phone, null);
  const updated = api<{ data: Guest }>(`/guests/${third.id}`, { method: 'PUT', body: { email: 'juan@example.com', phone: '123456' } }).data;
  assert.equal(updated.email, 'juan@example.com');
  const cleared = api<{ data: Guest }>(`/guests/${third.id}`, { method: 'PUT', body: { email: '', phone: null } }).data;
  assert.equal(cleared.email, null);
  assert.equal(cleared.phone, null);
});

test('contactos opcionales no permiten valores inválidos ni emails duplicados', () => {
  const api = createDemoApi(TODAY);
  const name = { firstName: 'Juan', lastName: 'Pérez' };
  assert.throws(() => api('/guests', { method: 'POST', body: { ...name, email: 'inválido' } }), DemoApiError);
  assert.throws(() => api('/guests', { method: 'POST', body: { ...name, phone: '12' } }), DemoApiError);
  api('/guests', { method: 'POST', body: { ...name, email: 'juan@example.com', phone: '123456' } });
  assert.throws(() => api('/guests', { method: 'POST', body: { ...name, email: 'juan@example.com' } }), DemoApiError);
  const reservation = api<{ data: Reservation }>('/reservations', { method: 'POST', body: { ...stay, roomId: 1, persons: 2, guest: { ...name, email: 'juan@example.com' } } }).data;
  assert.equal(reservation.guest?.phone, '123456');
});

test('reserva grupal para 16 personas ocupa cuatro habitaciones y cobra un anticipo conjunto', () => {
  const api = createDemoApi(TODAY);
  const rooms = [9, 10, 11, 12].map((roomId) => ({ roomId, persons: 4, extraBeds: 0 }));
  const created = api<{ data: Reservation }>('/reservations', { method: 'POST', body: { ...draft, rooms, persons: 16, payment: { amount: 100000, method: 'TRANSFER' } } }).data;
  assert.equal(created.persons, 16);
  assert.equal(created.rooms?.length, 4);
  assert.equal(created.totals.total, 1320000);
  assert.equal(created.totals.amountPaid, 100000);
  assert.equal(created.totals.balance, 1220000);
  const available = () => api<{ data: Room[] }>(`/rooms/available?checkIn=${stay.checkIn}&checkOut=${stay.checkOut}`).data;
  assert.ok(available().every((room) => room.id < 9));
  const calendar = api<{ data: CalendarData }>(`/calendar?from=${stay.checkIn}&to=${stay.checkOut}`).data;
  assert.ok(calendar.rooms.filter((room) => room.id >= 9).every((room) => room.cells[0].reservations.some((ref) => ref.id === created.id)));
  const summary = api<{ data: Summary }>(`/summary?from=${stay.checkIn}&to=${stay.checkOut}`).data;
  assert.equal(summary.occupancy.occupiedRoomNights, 12);
  assert.throws(() => api('/reservations', { method: 'POST', body: { ...draft, roomId: 12, persons: 2 } }), DemoApiError);
  api(`/reservations/${created.id}/cancel`, { method: 'POST' });
  assert.equal(available().filter((room) => room.id >= 9).length, 4);
});

test('un link grupal congela todas las tarifas y muestra la distribución sin números internos', () => {
  const api = createDemoApi(TODAY);
  const rooms = [9, 10, 11, 12].map((roomId) => ({ roomId, persons: 4, extraBeds: 0 }));
  const link = makeLink(api, { rooms, persons: 16 });
  api('/rooms/12', { method: 'PUT', body: { price: 999999 } });
  const quote = api<{ data: PublicBookingQuote }>(`/public/booking/${link.token}`).data;
  assert.equal(quote.stay.rooms?.length, 4);
  assert.ok(quote.stay.rooms?.every((room) => !('number' in room) && !('roomId' in room)));
  const reservation = submitLink(api, link);
  assert.equal(reservation.totals.total, link.totals.total);
  assert.equal(reservation.rooms?.[3].roomPrice, 110000);
  const approved = api<{ data: Reservation }>(`/reservations/${reservation.id}/approve`, { method: 'POST' }).data;
  assert.equal(approved.payments.length, 1);
  assert.equal(approved.payments[0].amount, link.totals.deposit);
});

test('limpieza automática por habitación congela descripción y frecuencia al emitir el link', () => {
  const api = createDemoApi(TODAY);
  const service = api<{ data: Service }>('/services', { method: 'POST', body: { name: 'Limpieza adicional', description: 'Baño y recambio de toallas. No incluye sábanas.', price: 5000, chargeType: 'PER_ROOM_INTERVAL', intervalDays: 3 } }).data;
  const rooms = [9, 10].map((roomId) => ({ roomId, persons: 2, extraBeds: 0 }));
  const link = makeLink(api, { rooms, persons: 4, checkIn: '2026-12-01', checkOut: '2026-12-11', services: [{ serviceId: service.id, quantity: 999 }] });
  assert.equal(link.services[0].quantity, 6);
  assert.equal(link.totals.servicesTotal, 30000);
  api(`/services/${service.id}`, { method: 'PUT', body: { description: 'Otra oferta', intervalDays: 1, price: 99000 } });
  const quote = api<{ data: PublicBookingQuote }>(`/public/booking/${link.token}`).data;
  assert.equal(quote.services[0].description, service.description);
  assert.equal(quote.services[0].intervalDays, 3);
  assert.equal(quote.services[0].lineTotal, 30000);
  const reservation = submitLink(api, link);
  assert.equal(reservation.services[0].description, service.description);
  assert.equal(reservation.services[0].intervalDays, 3);
  assert.equal(reservation.services[0].quantity, 6);
  assert.equal(reservation.totals.total, link.totals.total);
});

test('limpieza sin intervenciones durante una estadía corta no genera cargos', () => {
  const api = createDemoApi(TODAY);
  const service = api<{ data: Service }>('/services', { method: 'POST', body: { name: 'Limpieza cada tres días', price: 5000, chargeType: 'PER_ROOM_INTERVAL', intervalDays: 3 } }).data;
  const link = makeLink(api, { services: [{ serviceId: service.id, quantity: 1 }] });
  assert.equal(link.services[0].quantity, 0);
  assert.equal(link.totals.servicesTotal, 0);
  const reservation = submitLink(api, link);
  assert.equal(reservation.services[0].quantity, 0);
  assert.equal(reservation.totals.servicesTotal, 0);
});

test('un conflicto en la última habitación rechaza todo el grupo sin ocupar las demás', () => {
  const api = createDemoApi(TODAY);
  api('/reservations', { method: 'POST', body: { ...draft, roomId: 12, persons: 4 } });
  const rooms = [9, 10, 11, 12].map((roomId) => ({ roomId, persons: 4, extraBeds: 0 }));
  assert.throws(() => api('/reservations', { method: 'POST', body: { ...draft, rooms, persons: 16 } }), DemoApiError);
  const available = api<{ data: Room[] }>(`/rooms/available?checkIn=${stay.checkIn}&checkOut=${stay.checkOut}`).data;
  assert.equal(available.filter((room) => room.id >= 9).length, 3);
});

test('la demo inicia con identidad ficticia y datos coherentes', () => {
  const api = createDemoApi(TODAY);
  assert.match(api<{ user: User }>('/auth/me').user.companyName, /Demo/);
  assert.equal(api<Page<Room>>('/rooms').data.length, 12);
  const report = api<{ data: Summary }>('/summary?from=2026-10-01&to=2026-10-31').data;
  assert.equal(report.daily.length, 31);
  assert.equal(report.occupancy.totalRoomNights, 372);
  assert.ok(report.revenue.total > 0);
  assert.ok(report.occupancy.occupiedRoomNights > 0);
});

test('permite crear una reserva con huésped nuevo y anticipo simulado', () => {
  const api = createDemoApi(TODAY);
  const created = api<{ data: Reservation }>('/reservations', { method: 'POST', body: {
    ...draft, guestId: undefined,
    guest: { firstName: 'Ana', lastName: 'Demo', phone: '0000000000', email: 'ana@example.test' },
    payment: { amount: 30000, method: 'TRANSFER' },
  } }).data;
  assert.equal(created.status, 'RESERVED');
  assert.equal(created.guest?.firstName, 'Ana');
  assert.equal(created.totals.total, 204000);
  assert.equal(created.totals.balance, 174000);
  assert.equal(api<{ data: Summary }>(`/summary?from=${TODAY}&to=${TODAY}`).data.reservationsPage.created >= 1, true);
});

test('crear, registrar un pago y consultar detalle actualiza el mismo estado local', () => {
  const api = createDemoApi(TODAY);
  const reservation = api<{ data: Reservation }>('/reservations', { method: 'POST', body: draft }).data;
  assert.equal(reservation.status, 'PENDING');
  api(`/reservations/${reservation.id}/payments`, { method: 'POST', body: { amount: 20000, method: 'CASH' } });
  const updated = api<{ data: Reservation }>(`/reservations/${reservation.id}`).data;
  assert.equal(updated.status, 'RESERVED');
  assert.equal(updated.totals.balance, 184000);
  const report = api<{ data: Summary }>(`/summary?from=${TODAY}&to=${TODAY}`).data;
  assert.ok(report.revenue.byMethod.CASH >= 20000);
});

test('el calendario y la disponibilidad reflejan nuevas reservas y cancelaciones', () => {
  const api = createDemoApi(TODAY);
  const reservation = api<{ data: Reservation }>('/reservations', { method: 'POST', body: draft }).data;
  const available = () => api<{ data: Room[] }>(`/rooms/available?checkIn=${stay.checkIn}&checkOut=${stay.checkOut}`).data;
  assert.ok(!available().some((room) => room.id === 1));
  const calendar = api<{ data: CalendarData }>('/calendar?from=2026-12-01&to=2026-12-04').data;
  assert.equal(calendar.rooms[0].cells[0].status, 'OCCUPIED');
  assert.equal(calendar.rooms[0].cells[3].status, 'AVAILABLE');
  api(`/reservations/${reservation.id}/cancel`, { method: 'POST' });
  assert.ok(available().some((room) => room.id === 1));
});

test('rechaza solapamientos, pero permite check-in el día del check-out previo', () => {
  const api = createDemoApi(TODAY);
  api('/reservations', { method: 'POST', body: draft });
  assert.throws(() => api('/reservations', { method: 'POST', body: draft }), (error: DemoApiError) => error.code === 'ROOM_CONFLICT');
  assert.doesNotThrow(() => api('/reservations', { method: 'POST', body: { ...draft, checkIn: stay.checkOut, checkOut: '2026-12-05' } }));
});

test('la demo rechaza importes inválidos y sobrepagos sin modificar la reserva', () => {
  const api = createDemoApi(TODAY);
  const reservation = api<{ data: Reservation }>('/reservations', { method: 'POST', body: draft }).data;
  for (const amount of [-1, 0, 0.001, 99999999, 'no válido']) {
    assert.throws(() => api(`/reservations/${reservation.id}/payments`, { method: 'POST', body: { amount, method: 'CASH' } }), DemoApiError);
  }
  assert.equal(api<{ data: Reservation }>(`/reservations/${reservation.id}`).data.payments.length, 0);
});

test('bloquea MercadoPago e integraciones sin realizar peticiones de red', () => {
  const api = createDemoApi(TODAY);
  for (const path of ['/mp/connect', '/integrations/instagram/connect', '/public/booking/token/receipt', '/conversations/1/messages']) {
    assert.throws(() => api(path, { method: 'POST' }), (error: DemoApiError) => error.code === 'DEMO_OPERATION_DISABLED');
  }
  assert.throws(() => api('/reservations', { method: 'POST', body: { ...draft, generatePaymentLink: true } }), DemoApiError);
  assert.throws(() => api('/reservations', { method: 'POST', body: { ...draft, payment: { amount: 20000, method: 'MERCADOPAGO' } } }), DemoApiError);
});

test('las respuestas no exponen referencias mutables y no permite eliminar habitaciones en uso', () => {
  const api = createDemoApi(TODAY);
  const rooms = api<Page<Room>>('/rooms').data;
  rooms[0].price = 1;
  assert.equal(api<Page<Room>>('/rooms').data[0].price, 68000);
  assert.throws(() => api('/rooms/1', { method: 'DELETE' }), DemoApiError);
});

const guestDraft = { firstName: 'Ana', lastName: 'Demo', phone: '0000000000', email: 'ana@hotel-demo.example' };

function makeLink(api: ReturnType<typeof createDemoApi>, changes = {}) {
  return api<{ data: BookingLink }>('/booking-links', { method: 'POST', body: { ...draft, ...changes } }).data;
}

function submitLink(api: ReturnType<typeof createDemoApi>, link: BookingLink) {
  api(`/public/booking/${link.token}`, { method: 'POST', body: { ...guestDraft, receiptPath: 'demo-comprobante' } });
  return api<Page<Reservation>>('/reservations?source=PUBLIC_LINK').data.find((r) => r.bookingLink?.id === link.id)!;
}

test('permite crear, editar y eliminar catálogos nuevos sin alterar las fixtures de otra sesión', () => {
  const api = createDemoApi(TODAY);
  const type = api<{ data: RoomType }>('/room-types', { method: 'POST', body: { name: 'Suite demo' } }).data;
  const room = api<{ data: Room }>('/rooms', { method: 'POST', body: {
    number: '501', typeId: type.id, capacity: 2, maxExtraBeds: 1, price: 125000,
    pricingMode: 'PER_PERSON', amenities: ['Balcón'], isActive: true,
  } }).data;
  api(`/room-types/${type.id}`, { method: 'PUT', body: { name: 'Suite renovada' } });
  api(`/rooms/${room.id}`, { method: 'PUT', body: { price: 130000, isActive: false } });
  const saved = api<Page<Room>>('/rooms?search=501').data[0];
  assert.equal(saved.price, 130000);
  assert.equal(saved.type?.name, 'Suite renovada');
  assert.ok(!api<{ data: Room[] }>(`/rooms/available?checkIn=${stay.checkIn}&checkOut=${stay.checkOut}`).data.some((r) => r.id === room.id));
  assert.throws(() => api(`/room-types/${type.id}`, { method: 'DELETE' }), DemoApiError);
  api(`/rooms/${room.id}`, { method: 'DELETE' });
  api(`/room-types/${type.id}`, { method: 'DELETE' });
  assert.equal(api<Page<Room>>('/rooms').meta.total, 12);
  assert.equal(createDemoApi(TODAY)<{ data: RoomType[] }>('/room-types').data.length, 3);
});

test('edita servicios y huéspedes, y refleja el huésped actualizado en sus reservas', () => {
  const api = createDemoApi(TODAY);
  const service = api<{ data: Service }>('/services', { method: 'POST', body: { name: 'Masaje demo', price: 20000, chargeType: 'PACK' } }).data;
  api(`/services/${service.id}`, { method: 'PUT', body: { price: 22000 } });
  assert.equal(api<{ data: Service[] }>('/services').data.find((s) => s.id === service.id)?.price, 22000);
  api(`/services/${service.id}`, { method: 'DELETE' });
  const guest = api<{ data: Guest }>('/guests', { method: 'POST', body: guestDraft }).data;
  const reservation = api<{ data: Reservation }>('/reservations', { method: 'POST', body: { ...draft, guestId: guest.id } }).data;
  api(`/guests/${guest.id}`, { method: 'PUT', body: { firstName: 'Ana editada' } });
  assert.equal(api<{ data: Reservation }>(`/reservations/${reservation.id}`).data.guest?.firstName, 'Ana editada');
});

test('valida cambios de catálogo antes de aplicarlos', () => {
  const api = createDemoApi(TODAY);
  for (const body of [{ price: -1 }, { capacity: 0 }, { number: '102' }, { typeId: 999 }]) {
    assert.throws(() => api('/rooms/1', { method: 'PUT', body }), DemoApiError);
  }
  assert.equal(api<Page<Room>>('/rooms').data[0].price, 68000);
  assert.throws(() => api('/services/1', { method: 'PUT', body: { chargeType: 'INVALID' } }), DemoApiError);
  assert.throws(() => api('/guests', { method: 'POST', body: { ...guestDraft, email: 'inválido' } }), DemoApiError);
});

test('crea un link, muestra la cotización sin número de habitación y congela precios', () => {
  const api = createDemoApi(TODAY);
  const link = makeLink(api, { services: [{ serviceId: 1, quantity: 6 }] });
  assert.equal(link.totals.total, 255000);
  assert.equal(link.totals.deposit, 50000);
  assert.equal(link.share?.whatsappUrl, '');
  api('/rooms/1', { method: 'PUT', body: { price: 99000 } });
  api('/services/1', { method: 'PUT', body: { price: 10000, isActive: false } });
  const quote = api<{ data: PublicBookingQuote }>(`/public/booking/${link.token}`).data;
  assert.equal(quote.stay.roomType, 'Doble');
  assert.ok(!('number' in quote.stay));
  assert.equal(quote.totals.total, 255000);
  const reservation = submitLink(api, link);
  assert.equal(reservation.totals.total, 255000);
  assert.equal(reservation.services[0].unitPrice, 8500);
  assert.equal(reservation.payments.length, 0);
  assert.equal(reservation.status, 'PENDING');
  assert.equal(reservation.source, 'PUBLIC_LINK');
});

test('el comprobante es ficticio, aprobar registra el anticipo una sola vez y actualiza el resumen', () => {
  const api = createDemoApi(TODAY);
  const link = makeLink(api);
  assert.throws(() => api(`/public/booking/${link.token}`, { method: 'POST', body: guestDraft }), DemoApiError);
  const reservation = submitLink(api, link);
  const receipt = api<{ data: ReservationReceiptDetail }>(`/reservations/${reservation.id}/receipt`).data;
  assert.match(receipt.url, /^data:image\/svg\+xml,/);
  const before = api<{ data: Summary }>(`/summary?from=${TODAY}&to=${TODAY}`).data.revenue.total;
  assert.throws(() => submitLink(api, link), (error: DemoApiError) => error.status === 409);
  assert.throws(() => api(`/reservations/${reservation.id}/payments`, { method: 'POST', body: { amount: 10, method: 'CASH' } }), DemoApiError);
  const approved = api<{ data: Reservation }>(`/reservations/${reservation.id}/approve`, { method: 'POST' }).data;
  assert.equal(approved.status, 'RESERVED');
  assert.equal(approved.payments.length, 1);
  assert.equal(approved.payments[0].method, 'TRANSFER');
  assert.equal(approved.payments[0].amount, link.totals.deposit);
  assert.equal(api<{ data: Summary }>(`/summary?from=${TODAY}&to=${TODAY}`).data.revenue.total, before + link.totals.deposit);
  assert.throws(() => api(`/reservations/${reservation.id}/approve`, { method: 'POST' }), DemoApiError);
  assert.equal(api<{ data: BookingLink[] }>('/booking-links?status=COMPLETED').data[0].reservation?.status, 'RESERVED');
});

test('rechazar una solicitud no genera ingresos y libera la habitación', () => {
  const api = createDemoApi(TODAY);
  const reservation = submitLink(api, makeLink(api));
  const rejected = api<{ data: Reservation }>(`/reservations/${reservation.id}/reject`, { method: 'POST', body: { reason: 'Comprobante de prueba' } }).data;
  assert.equal(rejected.status, 'CANCELLED');
  assert.match(rejected.notes!, /Comprobante de prueba/);
  assert.equal(rejected.payments.length, 0);
  assert.ok(api<{ data: Room[] }>(`/rooms/available?checkIn=${stay.checkIn}&checkOut=${stay.checkOut}`).data.some((r) => r.id === 1));
});

test('anula links abiertos, valida anticipos y no permite enviar dos ofertas sobre una habitación ocupada', () => {
  const api = createDemoApi(TODAY);
  assert.throws(() => makeLink(api, { deposit: 99999999 }), DemoApiError);
  const cancelled = makeLink(api);
  api(`/booking-links/${cancelled.id}/cancel`, { method: 'POST' });
  assert.throws(() => submitLink(api, cancelled), DemoApiError);
  const first = makeLink(api);
  const second = makeLink(api);
  submitLink(api, first);
  assert.throws(() => submitLink(api, second), (error: DemoApiError) => error.code === 'ROOM_CONFLICT');
  assert.equal(api<{ data: BookingLink[] }>('/booking-links?status=OPEN').data[0].id, second.id);
  const firstPage = api<Page<BookingLink>>('/booking-links?page=1&pageSize=1');
  const secondPage = api<Page<BookingLink>>('/booking-links?page=2&pageSize=1');
  assert.equal(firstPage.meta.total, 3);
  assert.equal(firstPage.meta.totalPages, 3);
  assert.equal(firstPage.data[0].id, second.id);
  assert.equal(secondPage.data[0].id, first.id);
  assert.equal(api<Page<BookingLink>>('/booking-links?status=OPEN&pageSize=1').meta.total, 1);
  assert.equal(api<Page<Reservation>>('/reservations?source=PUBLIC_LINK').meta.total, 1);
});

test('el recorrido sin anticipo no exige comprobante ni registra un pago al aprobar', () => {
  const api = createDemoApi(TODAY);
  const link = makeLink(api, { deposit: 0 });
  api(`/public/booking/${link.token}`, { method: 'POST', body: guestDraft });
  const reservation = api<Page<Reservation>>('/reservations?source=PUBLIC_LINK').data[0];
  assert.equal(reservation.receipt, undefined);
  const approved = api<{ data: Reservation }>(`/reservations/${reservation.id}/approve`, { method: 'POST' }).data;
  assert.equal(approved.status, 'RESERVED');
  assert.equal(approved.payments.length, 0);
});

test('el recorrido de link y los catálogos funcionan sin fetch ni URLs externas', () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('La demo no debe acceder a la red.'); };
  try {
    const api = createDemoApi(TODAY);
    api('/companies/current', { method: 'PATCH', body: { configPage: { bookingTheme: DEFAULT_BOOKING_THEME } } });
    api('/services/1', { method: 'PUT', body: { price: 9000 } });
    const link = makeLink(api);
    assert.match(link.url, /^\/reserva\/demo-/);
    api(`/public/booking/${link.token}`);
    const reservation = submitLink(api, link);
    api(`/reservations/${reservation.id}/receipt`);
    api(`/reservations/${reservation.id}/approve`, { method: 'POST' });
    for (const path of [`/public/booking/${link.token}/receipt`, '/companies/current', '/conversations']) {
      assert.throws(() => api(path, { method: 'POST' }), (error: DemoApiError) => error.code === 'DEMO_OPERATION_DISABLED');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('la configuración inicia con la paleta del CRM y se reinicia entre sesiones', () => {
  const api = createDemoApi(TODAY);
  const settings = api<{ data: CompanySettings }>('/companies/current').data;
  assert.deepEqual(settings.configPage.bookingTheme, DEFAULT_BOOKING_THEME);
  assert.equal(DEFAULT_BOOKING_THEME.primary, '#7650C7');
  assert.equal(DEFAULT_BOOKING_THEME.background, '#0B1020');
  assert.equal(settings.hotelCapacity, 36);
  assert.equal(settings.maxAvailabilityPersons, 36);
  api('/companies/current', { method: 'PATCH', body: { bookingDepositPercent: 35 } });
  assert.equal(api<{ data: CompanySettings }>('/companies/current').data.bookingDepositPercent, 35);
  assert.equal(createDemoApi(TODAY)<{ data: CompanySettings }>('/companies/current').data.bookingDepositPercent, 20);
  settings.configPage.bookingTheme!.primary = '#FFFFFF';
  assert.equal(api<{ data: CompanySettings }>('/companies/current').data.configPage.bookingTheme?.primary, '#7650C7');
});

test('guardar el estilo y contacto actualiza la página del huésped incluso para links previos', () => {
  const api = createDemoApi(TODAY);
  const link = makeLink(api);
  const theme = { primary: '#123456', secondary: '#789ABC', accent: '#ABCDEF', text: '#112233', background: '#F1F2F3', surface: '#FFFFFF' };
  api('/companies/current', { method: 'PATCH', body: {
    whatsapp: '0000000000', phone: '0000000001', bookingSlug: 'aurora-demo',
    configPage: { bookingTheme: theme, maxAvailabilityPersons: 12 },
  } });
  const quote = api<{ data: PublicBookingQuote }>(`/public/booking/${link.token}`).data;
  assert.deepEqual(quote.hotel.bookingTheme, theme);
  assert.equal(quote.hotel.whatsapp, '0000000000');
  assert.equal(quote.hotel.phone, '0000000001');
  assert.equal(quote.totals.deposit, link.totals.deposit);
  api('/companies/current', { method: 'PATCH', body: { configPage: { bookingTheme: DEFAULT_BOOKING_THEME } } });
  const saved = api<{ data: CompanySettings }>('/companies/current').data;
  assert.deepEqual(saved.configPage.bookingTheme, DEFAULT_BOOKING_THEME);
  assert.equal(saved.configPage.maxAvailabilityPersons, 12);
  assert.equal(saved.bookingSlug, 'aurora-demo');
});

test('el anticipo configurado solo cambia las ofertas nuevas y admite cero sin comprobante', () => {
  const api = createDemoApi(TODAY);
  const previous = makeLink(api);
  api('/companies/current', { method: 'PATCH', body: { bookingDepositPercent: 50 } });
  assert.equal(makeLink(api).totals.deposit, 100000);
  assert.equal(api<{ data: PublicBookingQuote }>(`/public/booking/${previous.token}`).data.totals.deposit, 40000);
  api('/companies/current', { method: 'PATCH', body: { bookingDepositPercent: 0 } });
  const zero = makeLink(api);
  assert.equal(zero.totals.deposit, 0);
  api(`/public/booking/${zero.token}`, { method: 'POST', body: guestDraft });
  assert.equal(api<Page<Reservation>>('/reservations?source=PUBLIC_LINK').data[0].receipt, undefined);
});

test('rechaza ajustes inválidos sin guardar parcialmente otros cambios', () => {
  const api = createDemoApi(TODAY);
  for (const changes of [
    { bookingDepositPercent: -1 }, { bookingDepositPercent: 101 }, { bookingDepositPercent: 2.5 },
    { bookingSlug: 'slug inválido' }, { configPage: { maxAvailabilityPersons: 37 } },
    { configPage: { bookingTheme: { ...DEFAULT_BOOKING_THEME, primary: 'red' } } },
    { configPage: null }, { configPage: { bookingTheme: {} } }, { name: 'Otro hotel' },
  ]) {
    assert.throws(() => api('/companies/current', { method: 'PATCH', body: { phone: '1111', ...changes } }), DemoApiError);
    assert.equal(api<{ data: CompanySettings }>('/companies/current').data.phone, null);
  }
  api('/rooms/1', { method: 'PUT', body: { isActive: false } });
  assert.equal(api<{ data: CompanySettings }>('/companies/current').data.hotelCapacity, 34);
});

test('el tema conserva los colores personalizados, completa valores inválidos y adapta el contraste', () => {
  assert.equal(bookingThemeFromConfig({ bookingTheme: { primary: '#abcdef', text: 'inválido' } }).primary, '#ABCDEF');
  assert.equal(bookingThemeFromConfig({ bookingTheme: { text: 'inválido' } }).text, DEFAULT_BOOKING_THEME.text);
  assert.equal(bookingThemeFromConfig({ bookingTheme: { background: '#FFFFFF' } }).surface, DEFAULT_BOOKING_THEME.surface);
  assert.equal(bookingThemeFromConfig({ bookingTheme: { surface: '#abcdef' } }).surface, '#ABCDEF');
  const dark = bookingThemeStyle(DEFAULT_BOOKING_THEME) as Record<string, unknown>;
  assert.equal(dark.colorScheme, 'dark');
  assert.equal(dark['--booking-primary-contrast'], '#FFFFFF');
  assert.equal(dark['--booking-surface'], DEFAULT_BOOKING_THEME.surface);
  assert.equal(dark['--booking-secondary-contrast'], '#0B1020');
  const light = bookingThemeStyle({ ...DEFAULT_BOOKING_THEME, background: '#FFFFFF', primary: '#FFFFFF' }) as Record<string, unknown>;
  assert.equal(light.colorScheme, 'light');
  assert.equal(light['--booking-primary-contrast'], '#0B1020');
});

test('reiniciar el motor restaura fixtures y no comparte cambios entre sesiones', () => {
  const first = createDemoApi(TODAY);
  const count = first<Page<Reservation>>('/reservations').meta.total;
  first('/reservations', { method: 'POST', body: draft });
  assert.equal(first<Page<Reservation>>('/reservations').meta.total, count + 1);
  assert.equal(createDemoApi(TODAY)<Page<Reservation>>('/reservations').meta.total, count);
});

test('permite buscar, filtrar estados y paginar reservas', () => {
  const api = createDemoApi(TODAY);
  const first = api<Page<Reservation>>('/reservations?status=RESERVED&pageSize=5');
  assert.equal(first.data.length, 5);
  assert.ok(first.data.every((r) => r.status === 'RESERVED'));
  const second = api<Page<Reservation>>('/reservations?status=RESERVED&pageSize=5&page=2');
  assert.notEqual(first.data[0].id, second.data[0].id);
  const result = api<Page<Reservation>>(`/reservations?search=${first.data[0].code}`);
  assert.equal(result.data.length, 1);
});

test('valida fechas, capacidad y el estado antes de efectuar cambios', () => {
  const api = createDemoApi(TODAY);
  for (const changes of [{ checkOut: stay.checkIn }, { checkIn: '2026-02-30' }, { persons: 99 }]) {
    assert.throws(() => api('/reservations', { method: 'POST', body: { ...draft, ...changes } }), DemoApiError);
  }
  const r = api<{ data: Reservation }>('/reservations', { method: 'POST', body: draft }).data;
  assert.throws(() => api(`/reservations/${r.id}/check-out`, { method: 'POST' }), DemoApiError);
});

test('check-in y check-out respetan estados y requieren saldar la reserva', () => {
  const api = createDemoApi(TODAY);
  const available = api<{ data: Room[] }>(`/rooms/available?checkIn=${TODAY}&checkOut=2026-10-27`).data;
  assert.ok(available.length > 0);
  const reservation = api<{ data: Reservation }>('/reservations', { method: 'POST', body: {
    ...draft, checkIn: TODAY, checkOut: '2026-10-27', roomId: available[0].id,
    payment: { amount: 10000, method: 'TRANSFER' },
  } }).data;
  assert.equal(api<{ data: Reservation }>(`/reservations/${reservation.id}/check-in`, { method: 'POST' }).data.status, 'CHECKED_IN');
  assert.throws(() => api(`/reservations/${reservation.id}/check-out`, { method: 'POST' }), DemoApiError);
  api(`/reservations/${reservation.id}/payments`, { method: 'POST', body: { amount: reservation.totals.balance, method: 'CARD' } });
  const finished = api<{ data: Reservation }>(`/reservations/${reservation.id}/check-out`, { method: 'POST' }).data;
  assert.equal(finished.status, 'CHECKED_OUT');
  assert.equal(finished.totals.balance, 0);
});
