const BASE = 'http://localhost:3100/api';

function makeClient() {
  let cookie = '';
  return async function request(path, options = {}) {
    const res = await fetch(`${BASE}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(options.headers ?? {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      redirect: 'manual',
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      cookie = setCookie.split(';')[0];
    }
    let json = null;
    const text = await res.text();
    if (text) json = JSON.parse(text);
    return { status: res.status, json };
  };
}

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name} ${detail}`);
  }
}

const principal = makeClient();
const sol = makeClient();

const { json: companiesRes } = await principal('/companies');
const companies = companiesRes.data;
const principalCompany = companies.find((c) => c.name === 'Hotel Principal');
const solCompany = companies.find((c) => c.name === 'Hotel Sol');
check('companies list exposes both tenants', companies.length === 2 && !!principalCompany && !!solCompany);

// 1. Databases: credentials first, then select company (both tenants)
let r = await principal('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } });
check(
  'principal credentials -> companies',
  r.status === 200 &&
    Array.isArray(r.json.companies) &&
    r.json.companies.some((c) => c.id === principalCompany.id && c.role === 'ADMIN'),
  `status=${r.status} ${JSON.stringify(r.json)}`,
);
r = await principal('/auth/login/company', { method: 'POST', body: { companyId: principalCompany.id, username: 'admin', password: 'admin123' } });
check('principal selects company', r.status === 200 && r.json.user.companyId === principalCompany.id, `status=${r.status} ${JSON.stringify(r.json)}`);
r = await sol('/auth/login', { method: 'POST', body: { username: 'sol', password: 'admin123' } });
check('sol credentials -> companies', r.status === 200 && Array.isArray(r.json.companies) && r.json.companies.some((c) => c.id === solCompany.id), `status=${r.status}`);
r = await sol('/auth/login/company', { method: 'POST', body: { companyId: solCompany.id, username: 'sol', password: 'admin123' } });
check('sol selects company', r.status === 200 && r.json.user.companyId === solCompany.id, `status=${r.status}`);

// credentials with a wrong password must not reveal companies
r = await principal('/auth/login', { method: 'POST', body: { username: 'admin', password: 'wrong' } });
check('wrong password -> 401 without companies', r.status === 401, `status=${r.status}`);

// 2. Principal creates roomType + room + service
const typeName = `Tipo T-${Date.now()}`;
r = await principal('/room-types', { method: 'POST', body: { name: typeName } });
check('principal creates room type', r.status === 201, `status=${r.status}`);
const type = r.json.data;
const roomNumber = `T-${Date.now()}`;
r = await principal('/rooms', { method: 'POST', body: { number: roomNumber, typeId: type.id, capacity: 2, price: 50 } });
check('principal creates room', r.status === 201, `status=${r.status}`);
const principalRoom = r.json.data;
const svcName = `Svc T-${Date.now()}`;
r = await principal('/services', { method: 'POST', body: { name: svcName, price: 10, chargeType: 'PER_PERSON' } });
check('principal creates service', r.status === 201, `status=${r.status}`);
const principalSvc = r.json.data;

// 3. Sol cannot see principal entities
r = await sol('/rooms');
const solRooms = r.json.data;
check('sol rooms list excludes principal room', !solRooms.some((x) => x.id === principalRoom.id), JSON.stringify(solRooms.map((x) => x.id)));
r = await sol('/services');
const solSvcs = r.json.data;
check('sol services list excludes principal service', !solSvcs.some((x) => x.id === principalSvc.id));
r = await sol('/room-types');
const solTypes = r.json.data;
check('sol room-types list excludes principal type', !solTypes.some((x) => x.id === type.id));

// 4. Sol cannot reach principal entities by id
r = await sol(`/rooms/${principalRoom.id}`);
check('sol GET principal room -> 404', r.status === 404, `status=${r.status}`);
r = await sol(`/services/${principalSvc.id}`, { method: 'PUT', body: { name: 'Hack' } });
check('sol UPDATE principal service -> 404', r.status === 404, `status=${r.status}`);
r = await sol(`/rooms/${principalRoom.id}`, { method: 'DELETE' });
check('sol DELETE principal room -> 404', r.status === 404, `status=${r.status}`);
r = await sol(`/room-types/${type.id}`, { method: 'DELETE' });
check('sol DELETE principal type -> 404', r.status === 404, `status=${r.status}`);

// 5. Sol cannot create a reservation using principal's room
const inDays = new Date(Date.now() + 86400000 * 15).toISOString().slice(0, 10);
const outDays = new Date(Date.now() + 86400000 * 17).toISOString().slice(0, 10);
r = await sol('/reservations', {
  method: 'POST',
  body: { roomId: principalRoom.id, guest: { firstName: 'X', lastName: 'Y', phone: '123', email: 'x@y.com' }, checkIn: inDays, checkOut: outDays, persons: 1 },
});
check('sol reservation with principal room -> 404', r.status === 404, `status=${r.status} ${JSON.stringify(r.json)}`);

// 6. Principal creates reservation with guest upsert (transaction + ALS)
const email = `test-${Date.now()}@example.com`;
r = await principal('/reservations', {
  method: 'POST',
  body: { roomId: principalRoom.id, guest: { firstName: 'Ana', lastName: 'Prueba', phone: '555', email }, checkIn: inDays, checkOut: outDays, persons: 2, services: [{ serviceId: principalSvc.id }] },
});
check('principal creates reservation', r.status === 201, `status=${r.status} ${JSON.stringify(r.json)}`);
const reservation = r.json.data;
check('reservation has tenant-scoped quantities (PER_PERSON 2x2=4)', reservation.services[0].quantity === 4, JSON.stringify(reservation.services));

// 7. Sol cannot see/act on principal reservation
r = await sol(`/reservations/${reservation.id}`);
check('sol GET principal reservation -> 404', r.status === 404, `status=${r.status}`);
r = await sol(`/reservations/${reservation.id}/check-in`, { method: 'POST' });
check('sol check-in principal reservation -> 404', r.status === 404, `status=${r.status}`);

// 8. Principal check-in works (extension inside update)
r = await principal(`/reservations/${reservation.id}/check-in`, { method: 'POST' });
check('principal check-in own reservation', r.status === 200 && r.json.data.status === 'CHECKED_IN', `status=${r.status} ${JSON.stringify(r.json)}`);

// 9. Summary isolation
r = await principal('/summary');
const principalSummary = r.json.data;
r = await sol('/summary');
const solSummary = r.json.data;
check('sol summary created reservations == 0', solSummary.reservationsPage.created === 0, JSON.stringify(solSummary.reservationsPage));
check('principal summary sees its creation', principalSummary.reservationsPage.created >= 1);

// 10. Duplicate unique per tenant: two companies may reuse same room number / email
const dupNumber = `DUP-${Date.now()}`;
r = await principal('/rooms', { method: 'POST', body: { number: dupNumber, typeId: type.id, capacity: 1, price: 20 } });
check('principal creates room with number', r.status === 201);
const dupRoom = r.json.data;
r = await sol('/rooms', { method: 'POST', body: { number: dupNumber, typeId: type.id, capacity: 1, price: 20 } });
check('sol can reuse same room number (different tenant) BUT with principal typeId -> not found', r.status === 404, `status=${r.status}`);
const solType = solTypes[0];
r = await sol('/rooms', { method: 'POST', body: { number: dupNumber, typeId: solType?.id ?? type.id, capacity: 1, price: 20 } });
if (solType) {
  check('sol reuses room number with own type -> 201', r.status === 201, `status=${r.status}`);
} else {
  console.log('  skip room-number reuse (sol has no type)');
}

// 11. Payment isolation: sol cannot delete principal payment
const payRes = await principal(`/reservations/${reservation.id}/payments`, { method: 'POST', body: { amount: 10, method: 'CASH' } });
check('principal registers payment', payRes.status === 201, `status=${payRes.status}`);
r = await sol(`/payments/${payRes.json.data.id}`, { method: 'DELETE' });
check('sol DELETE principal payment -> 404', r.status === 404, `status=${r.status}`);

// 12. Cleanup (principal)
r = await principal(`/reservations/${reservation.id}/cancel`, { method: 'POST' });
check('cleanup cancel reservation', r.status === 200);
r = await principal(`/rooms/${dupRoom.id}`, { method: 'DELETE' });
r = await principal(`/services/${principalSvc.id}`, { method: 'DELETE' });
r = await principal(`/rooms/${principalRoom.id}`, { method: 'DELETE' });
r = await principal(`/room-types/${type.id}`, { method: 'DELETE' });
r = await principal('/guests', {});
const guestsForCleanup = r.json.data.filter((g) => g.email === email || g.email === 'x@y.com');
for (const g of guestsForCleanup) {
  if (g.reservationsCount === 0) {
    // leave as-is, guests may have no DELETE endpoint; harmless
  }
}
r = await sol(`/reservations?status=all`, {});
const solRes = await sol('/summary');
check('final sol summary created == 0', solRes.json.data.reservationsPage.created === 0, JSON.stringify(solRes.json.data.reservationsPage));

console.log(failures === 0 ? '\nALL OK' : `\n${failures} FAILURES`);