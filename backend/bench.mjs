import autocannon from 'autocannon';

const BASE = (process.env.BENCH_BASE ?? 'http://localhost:3000').replace(/\/+$/, '');
const USER = process.env.BENCH_USER ?? 'ElNomada';
const PASS = process.env.BENCH_PASS ?? 'Vehemente676!';
const COMPANY = process.env.BENCH_COMPANY ?? 'ElNomada';
const N_ROOMS = int('BENCH_ROOMS', 40);
const N_RESERVATIONS = int('BENCH_RESERVATIONS', 60);
const DURATION = int('BENCH_DURATION', 10);
const TIMEOUT = int('BENCH_TIMEOUT', 30);
const P97_LIMIT = int('BENCH_P97_LIMIT', 250);
const RAMP = (process.env.BENCH_RAMP ?? '1,5,10,15,20,30,50').split(',').filter(Boolean).map(Number);
const SEED = process.env.BENCH_SEED !== '0';

// Solo lectura a proposito: las reservas se siembran antes de medir, y las
// pantallas de guests/room-types se dejan fuera porque su costo es trivial
// comparado con summary.
const SCENARIOS = [
  { name: 'health', path: '/health', auth: false },
  { name: 'rooms', path: '/api/rooms?page=1&pageSize=20', auth: true },
  { name: 'reservations', path: '/api/reservations?page=1&pageSize=20', auth: true },
  { name: 'summary', path: '/api/summary', auth: true },
];

function int(name, fallback) {
  const v = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function dayISO(offset) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

let cookie = '';

async function api(path, options = {}) {
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
  const setCookies =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean);
  for (const c of setCookies) {
    if (c.startsWith('gh_token=')) cookie = c.split(';')[0];
  }
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!res.ok) {
    const detail = json?.error ? `${json.error.code}: ${json.error.message}` : `HTTP ${res.status}`;
    throw new Error(`${options.method ?? 'GET'} ${path} -> ${detail}`);
  }
  return json;
}

async function preflight() {
  try {
    const res = await fetch(`${BASE}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error(`\nNo puedo hablar con ${BASE}/health (${err.message})`);
    console.error('Levantá el backend antes de medir, y chequeá que BENCH_BASE apunte al puerto correcto.');
    process.exit(1);
  }
}

async function login() {
  const step1 = await api('/api/auth/login', { method: 'POST', body: { username: USER, password: PASS } });
  const companies = step1.companies ?? [];
  const target = companies.find((c) => c.name === COMPANY) ?? companies[0];
  if (!target) throw new Error(`El usuario ${USER} no tiene ninguna empresa.`);
  await api('/api/auth/login/company', {
    method: 'POST',
    body: { companyId: target.id, username: USER, password: PASS },
  });
  if (!cookie) throw new Error('El login no devolvio la cookie gh_token.');
  console.log(`Sesion de "${target.name}" como ${USER}`);
}

// Reutiliza un dataset estable en vez de crear uno nuevo por corrida: el bench
// necesita filas de tamaño conocido, no filas nuevas. Si ya existe lo que hace
// falta no crea nada, asi que repetir el bench no acumula datos.
//
// Todo lleva un tag fijo (BENCH) y no un timestamp justamente para poder
// reconocerlo despues. Secuencial a proposito: sembrar en paralelo competiria
// con el pool que estamos por medir.
const TAG = 'BENCH';
const ROOM_PREFIX = 'BENCH-';
const GUEST_PREFIX = 'bench-';

async function ensureSeed() {
  const types = (await api('/api/room-types?page=1&pageSize=100')).data;
  let type = types.find((t) => t.name === TAG);
  let created = { type: false, rooms: 0, reservations: 0, guests: 0 };

  if (!type) {
    type = (await api('/api/room-types', { method: 'POST', body: { name: TAG } })).data;
    created.type = true;
  }

  const existingRooms = (await api('/api/rooms?page=1&pageSize=100')).data.filter((r) =>
    r.number.startsWith(ROOM_PREFIX),
  );
  const usedNumbers = new Set(existingRooms.map((r) => r.number));
  const rooms = [...existingRooms];

  for (let i = 0; rooms.length < N_ROOMS && i < N_ROOMS * 4; i++) {
    const number = `${ROOM_PREFIX}${i}`;
    if (usedNumbers.has(number)) continue;
    usedNumbers.add(number);
    const r = await api('/api/rooms', {
      method: 'POST',
      body: { number, typeId: type.id, capacity: 2, price: 40000 + i },
    });
    rooms.push(r.data);
    created.rooms++;
  }

  const existingGuests = (await api('/api/guests?page=1&pageSize=100')).data.filter((g) =>
    String(g.email).startsWith(GUEST_PREFIX),
  );
  const guestEmails = new Set(existingGuests.map((g) => g.email));

  const listed = (await api('/api/reservations?page=1&pageSize=100')).data;
  const benchReservations = listed.filter((r) => String(r.guest?.email ?? '').startsWith(GUEST_PREFIX));

  // Las que ya existen se comieron los indices 0..startIndex-1, asi que las
  // nuevas arrancan desde ahi: si el indice reiniciara en 0,(room, fechas)
  // repetirian los de las viejas y la reserva rebotaria con ROOM_OCCUPIED.
  // La fecha sale de i sin modulo para que cada indice sea un periodo distinto.
  const startIndex = benchReservations.length;
  for (let i = startIndex; benchReservations.length < N_RESERVATIONS; i++) {
    const email = `${GUEST_PREFIX}${i}@bench.local`;
    const inDays = 1 + i;
    const guest = { firstName: 'Bench', lastName: `#${i}`, phone: `115555${1000 + i}`, email };
    if (!guestEmails.has(email)) {
      await api('/api/guests', { method: 'POST', body: guest });
      guestEmails.add(email);
      created.guests++;
    }
    const r = await api('/api/reservations', {
      method: 'POST',
      body: {
        roomId: rooms[i % rooms.length].id,
        guest,
        checkIn: dayISO(inDays),
        checkOut: dayISO(inDays + 2),
        persons: 1 + (i % 2),
      },
    });
    benchReservations.push(r.data);
    created.reservations++;
  }

  return { type, rooms: rooms.length, reservations: benchReservations.length, created };
}

// No hay cleanup por REST: /reservations no expone DELETE, cancelar deja la fila
// y ese FK bloquea el DELETE de la habitacion. Por eso el seed reutiliza y la
// purga real va por Prisma en bench.drop.ts (pnpm bench:drop).

async function measure(scenario, connections) {
  const r = await autocannon({
    url: `${BASE}${scenario.path}`,
    connections,
    duration: DURATION,
    pipelines: 1,
    timeout: TIMEOUT,
    renderProgressBar: false,
    headers: scenario.auth ? { Cookie: cookie } : {},
    title: `${scenario.name} c=${connections}`,
  });
  return {
    connections,
    rps: r.requests.average,
    total: r.requests.totalCount,
    avg: r.latency.average,
    p50: r.latency.p50,
    p97: r.latency.p97_5,
    p99: r.latency.p99,
    max: r.latency.max,
    ok2xx: r['2xx'],
    non2xx: r.non2xx,
    errors: r.errors,
    timeouts: r.timeouts,
  };
}

// El "codo" como un numero unico era enganoso: con la CPU compartida entre
// autocannon y el server hay ruido de +-20% y una sola caida de throughput
// dispara cualquier umbral. Se reportan las dos señales por separado.
function analyze(rows) {
  const maxRps = Math.max(...rows.map((r) => r.rps));
  const saturation = rows.find((r) => r.rps >= maxRps * 0.9)?.connections ?? null;
  const breach = rows.find((r) => r.p97 > P97_LIMIT)?.connections ?? null;
  return { maxRps, saturation, breach };
}

const pad = (v, w) => String(v).padStart(w);
const padL = (v, w) => String(v).padEnd(w);

function report(name, rows) {
  console.log(`\n${name}`);
  console.log(
    `  ${padL('conc', 6)}${padL('req/s', 11)}${padL('avg ms', 10)}${padL('p50 ms', 10)}` +
      `${padL('p97.5', 10)}${padL('p99 ms', 10)}${padL('max ms', 10)}${padL('2xx', 10)}${padL('no2xx', 8)}${padL('err', 7)}${pad('to', 6)}`,
  );
  for (const r of rows) {
    console.log(
      `  ${pad(r.connections, 6)}${pad(r.rps.toFixed(1), 11)}${pad(r.avg.toFixed(1), 10)}${pad(r.p50.toFixed(1), 10)}` +
        `${pad(r.p97.toFixed(1), 10)}${pad(r.p99.toFixed(1), 10)}${pad(r.max.toFixed(1), 10)}${pad(r.ok2xx, 10)}${pad(r.non2xx, 8)}${pad(r.errors, 7)}${pad(r.timeouts, 6)}`,
    );
  }
  const { maxRps, saturation, breach } = analyze(rows);
  const last = rows[rows.length - 1];
  console.log(
    `  Maximo ${maxRps.toFixed(0)} req/s, saturado desde c=${saturation ?? 'n/d'}.` +
      ` p97.5 cruza ${P97_LIMIT} ms en c=${breach ?? 'n/d'}.` +
      ` A c=${last.connections}: ${last.rps.toFixed(0)} req/s, p97.5 ${last.p97.toFixed(0)} ms.`,
  );
}

await preflight();
await login();

let failed = false;

if (SEED) {
  const seeded = await ensureSeed();
  console.log(
    `\nDataset: ${seeded.rooms} habitaciones y ${seeded.reservations} reservas con tag ${TAG}.` +
      ` Creados ahora: ${seeded.created.rooms} hab, ${seeded.created.guests} huespedes, ${seeded.created.reservations} reservas.`,
  );
} else {
  console.log('\nBENCH_SEED=0: se mide sobre la DB tal como esta.');
}

console.log(`\nRampa ${RAMP.join('/')} conexiones, ${DURATION}s cada punto, pipelines 1, timeout ${TIMEOUT}s`);

for (const scenario of SCENARIOS) {
  const rows = [];
  for (const connections of RAMP) {
    rows.push(await measure(scenario, connections));
  }
  report(`${scenario.name}  ${scenario.path}`, rows);
  if (rows[0].non2xx > 0) {
    console.error(`  ERROR: ${scenario.name} devuelve respuestas no-2xx ya con 1 conexion.`);
    failed = true;
  }
}

console.log(
  '\nPara dejar la DB como estaba: pnpm bench:drop' +
    ' (no se puede por REST, ver bench.drop.ts).',
);

if (failed) process.exit(1);
