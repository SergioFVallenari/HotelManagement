// E2E del flujo de reserva por WhatsApp contra el server local (:3100) y
// Supabase Storage real. Crea sus propias fixtures (tipo E2E, habitacion E2E-1
// y servicio E2E Desayuno) y no las borra: se purgan con `pnpm e2e:drop`.
const BASE = process.env.BASE ?? 'http://localhost:3100';

let cookie = '';
let failed = 0;

function log(step, ok, detail) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${step}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed += 1;
}

async function req(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined && !raw ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const pair = c.split(';')[0];
    if (pair.startsWith('gh_token=')) cookie = pair;
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

const iso = (d) => d.toISOString().slice(0, 10);
const future = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
};

const login = await req('/api/auth/login', {
  method: 'POST',
  body: { email: 'admin@hotelprincipal.test', password: 'admin123' },
});
log('login 1/2', login.status === 200, `status ${login.status} ${login.json?.error?.message ?? ''}`);
const companyId = login.json?.companies?.[0]?.id;
const supabaseToken = login.json?.token;

const step2 = await req('/api/auth/login/company', {
  method: 'POST',
  body: { companyId, token: supabaseToken },
});
log('login 2/2 (cookie)', step2.status === 200 && cookie !== '', `status ${step2.status}`);

// Fixtures del test (el seed deja habitaciones y servicios comentados).
const types = await req('/api/room-types?pageSize=100');
let typeId = types.json?.data?.find((t) => t.name === 'E2E')?.id;
if (!typeId) {
  const created = await req('/api/room-types', { method: 'POST', body: { name: 'E2E' } });
  typeId = created.json?.data?.id;
}
log('tipo de habitacion E2E', Boolean(typeId), `id ${typeId}`);

const rooms = await req('/api/rooms?pageSize=100');
let room = rooms.json?.data?.find((r) => r.number === 'E2E-1');
if (!room) {
  const created = await req('/api/rooms', {
    method: 'POST',
    body: { number: 'E2E-1', typeId, capacity: 2, maxExtraBeds: 1, price: 100000 },
  });
  room = created.json?.data;
}
log('habitacion E2E', Boolean(room), `${room.number} cap ${room.capacity} $${room.price}`);

const services = await req('/api/services?pageSize=100');
let service = services.json?.data?.find((s) => s.name === 'E2E Desayuno');
if (!service) {
  const created = await req('/api/services', {
    method: 'POST',
    body: { name: 'E2E Desayuno', price: 8000, chargeType: 'PER_PERSON' },
  });
  service = created.json?.data;
}
log('servicio E2E', Boolean(service), `${service.name} $${service.price}`);

const checkIn = future(30);
const checkOut = future(33);
const link = await req('/api/booking-links', {
  method: 'POST',
  body: {
    roomId: room.id,
    checkIn,
    checkOut,
    persons: 1,
    extraBeds: 0,
    services: [{ serviceId: service.id, quantity: 1 }],
  },
});
log(
  'crear link',
  link.status === 201,
  `${link.status} total=${link.json?.data?.totals?.total} anticipo=${link.json?.data?.totals?.deposit} url=${link.json?.data?.url}`,
);
const token = link.json?.data?.token;
const total = link.json?.data?.totals?.total;
const deposit = link.json?.data?.totals?.deposit;
log('anticipo = 20% redondeado a 10k', deposit === Math.round((total * 0.2) / 10000) * 10000, `${deposit} de ${total}`);
log('mensaje de WhatsApp', Boolean(link.json?.data?.share?.message), link.json?.data?.share?.whatsappUrl);

const quote = await req(`/api/public/booking/${token}`);
log(
  'cotizacion publica',
  quote.status === 200 && quote.json?.data?.totals?.total === total,
  `${quote.status} hotel=${quote.json?.data?.hotel?.name} roomType=${quote.json?.data?.stay?.roomType}`,
);
log('la cotizacion publica no filtra el numero de habitacion', quote.json?.data?.stay?.roomNumber === undefined);

const signed = await req(`/api/public/booking/${token}/receipt`, {
  method: 'POST',
  body: { fileName: 'comprobante.png', mimeType: 'image/png', size: 70 },
});
log('url firmada de subida', signed.status === 201, `${signed.status} path=${signed.json?.data?.path}`);

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);
const put = await fetch(signed.json.data.signedUrl, {
  method: 'PUT',
  headers: { 'content-type': 'image/png', 'cache-control': 'max-age=3600' },
  body: png,
});
log('PUT a Storage', put.ok, `status ${put.status}`);

const badPath = await req(`/api/public/booking/${token}`, {
  method: 'POST',
  body: {
    firstName: 'E2E',
    lastName: 'Booking',
    phone: '1155550000',
    email: 'e2e-booking@test.local',
    receiptPath: `company-${companyId}/otro-token/algo.png`,
  },
});
log('rechaza un comprobante de otro link', badPath.status === 400, `${badPath.status} ${badPath.json?.error?.code}`);

const submit = await req(`/api/public/booking/${token}`, {
  method: 'POST',
  body: {
    firstName: 'E2E',
    lastName: 'Booking',
    phone: '1155550000',
    email: 'e2e-booking@test.local',
    externalRef: 'TRF-998877',
    notes: 'Prueba automatica',
    receiptPath: signed.json.data.path,
    receiptFileName: 'comprobante.png',
  },
});
log(
  'enviar formulario',
  submit.status === 201,
  `${submit.status} code=${submit.json?.data?.code} total=${submit.json?.data?.total}`,
);
const code = submit.json?.data?.code;

const again = await req(`/api/public/booking/${token}`, {
  method: 'POST',
  body: {
    firstName: 'E2E',
    lastName: 'Booking',
    phone: '1155550000',
    email: 'e2e-booking@test.local',
  },
});
log('el link es de un solo uso', again.status === 409, `${again.status} ${again.json?.error?.code}`);

const list = await req('/api/reservations?source=PUBLIC_LINK&pageSize=100');
const created = list.json?.data?.find((r) => r.code === code);
log('reserva PENDING con origen PUBLIC_LINK', created?.status === 'PENDING' && created?.source === 'PUBLIC_LINK', `${created?.status}/${created?.source}`);
log('el anticipo NO se registra al enviar', created?.payments?.length === 0, `${created?.payments?.length} pagos`);
log('la reserva trae el comprobante', Boolean(created?.receipt?.id), created?.receipt?.fileName);

const receipt = await req(`/api/reservations/${created.id}/receipt`);
log('url firmada del comprobante', receipt.status === 200 && receipt.json?.data?.url?.startsWith('https://'), `${receipt.status} ${receipt.json?.data?.mimeType} ${receipt.json?.data?.size}b`);
const download = await fetch(receipt.json.data.url);
log('descarga del comprobante', download.ok, `status ${download.status}`);

const approve = await req(`/api/reservations/${created.id}/approve`, { method: 'POST' });
log(
  'aprobar',
  approve.status === 200 && approve.json?.data?.status === 'RESERVED',
  `${approve.status} ${approve.json?.data?.status} pagos=${approve.json?.data?.payments?.length}`,
);
const paid = approve.json?.data?.payments?.[0];
log('registra el anticipo como TRANSFER', paid?.method === 'TRANSFER' && paid?.amount === deposit, `${paid?.method} ${paid?.amount} ref=${paid?.reference}`);

const approveAgain = await req(`/api/reservations/${created.id}/approve`, { method: 'POST' });
log('no se aprueba dos veces', approveAgain.status === 409, `${approveAgain.status} ${approveAgain.json?.error?.code}`);

const pendingLink = await req('/api/booking-links?status=COMPLETED');
log('el link queda COMPLETED', pendingLink.json?.data?.some((l) => l.token === token), `${pendingLink.json?.data?.length} completados`);

const overlap = await req('/api/booking-links', {
  method: 'POST',
  body: { roomId: room.id, checkIn, checkOut, persons: 1, extraBeds: 0, services: [] },
});
log('rechaza un link para fechas ya ocupadas', overlap.status === 409, `${overlap.status} ${overlap.json?.error?.code}`);

const company = await req('/api/companies/current');
log('ajustes del hotel', company.status === 200, `anticipo ${company.json?.data?.bookingDepositPercent}% whatsapp=${company.json?.data?.whatsapp}`);

console.log(failed === 0 ? '\nTODO OK' : `\n${failed} FALLOS`);
if (failed === 0) console.log('Purgar los datos de prueba: pnpm e2e:drop');
process.exit(failed === 0 ? 0 : 1);
