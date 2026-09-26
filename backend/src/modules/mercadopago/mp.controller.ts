import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { AppError, conflict } from '../../lib/AppError.js';
import { getTenantId } from '../../lib/tenant.js';
import { parseIdParam } from '../../lib/pagination.js';
import { getReservation, serializeReservation } from '../reservations/reservations.service.js';
import { createOrderForReservation } from './mp.checkout.js';
import {
  buildAuthorizeUrl,
  connectAccount,
  disconnectAccount,
  exchangeAuthorizationCode,
  fetchSellerEmail,
  getConnection,
  signOauthState,
  verifyOauthState,
} from './mp.oauth.js';
import { authUrlSchema, regenerateSchema } from './mp.schema.js';
import { processWebhook } from './mp.webhook.js';

const SAFE_RETURN_TO = /^(https?:\/\/[^/]+|capacitor:\/\/[^/]+)$/;
const fallbackOrigin = (): string => env.corsOrigins[0] ?? 'http://localhost:5173';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

function httpOrigin(url: string): string | null {
  try {
    const { origin, protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? origin : null;
  } catch {
    return null;
  }
}

// MercadoPago devuelve al popup a este callback. En vez de pintar el resultado
// ahi (la ventanita quedaba abierta al pedo y la ventana original seguia
// mostrando "no conectado"), le devolvemos una paginita que le pasa el
// resultado a la ventana que la abrio y se cierra sola.
// Si no hay ninguna ventana que la haya abierto, el flujo no vino de un popup
// (o el navegador lo bloqueo) y redirigimos al igual que antes.
function finishOauth(res: Response, returnTo: string, query: string): void {
  const origin = SAFE_RETURN_TO.test(returnTo) ? returnTo : fallbackOrigin();
  const target = `${origin.replace(/\/+$/, '')}/settings?${query}`;
  const appOrigin = httpOrigin(target);

  res.status(200).type('html').send(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<title>MercadoPago</title>
</head>
<body style="font:15px/1.6 system-ui,sans-serif;margin:0;padding:40px;color:#495057">
<p>Cerrando esta ventana…</p>
<p style="font-size:13px"><a href="${escapeHtml(target)}">Abrir Ajustes</a></p>
<script>
(function () {
  var target = ${JSON.stringify(target)};
  var query = ${JSON.stringify(query)};
  var appOrigin = ${JSON.stringify(appOrigin)};
  if (appOrigin && window.opener && !window.opener.closed) {
    try {
      window.opener.postMessage({ type: 'mp:oauth', query: query }, appOrigin);
      window.close();
      return;
    } catch (err) {}
  }
  window.location.replace(target);
})();
</script>
</body>
</html>`);
}

export async function buildAuthUrlHandler(req: Request, res: Response): Promise<void> {
  const input = authUrlSchema.parse(req.body);
  const companyId = getTenantId()!;
  const state = signOauthState(companyId, input.returnTo);
  res.json({ data: { url: buildAuthorizeUrl(state) } });
}

export async function getConnectionHandler(req: Request, res: Response): Promise<void> {
  const companyId = getTenantId()!;
  res.json({ data: await getConnection(companyId) });
}

export async function disconnectHandler(req: Request, res: Response): Promise<void> {
  const companyId = getTenantId()!;
  const account = await prisma.companyMpAccount.findUnique({ where: { companyId } });
  if (!account) throw new AppError(404, 'MP_NOT_CONNECTED', 'No hay una cuenta de MercadoPago conectada');
  await disconnectAccount(companyId);
  res.status(204).end();
}

export async function oauthCallbackHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as Record<string, unknown>;
  const state = typeof query.state === 'string' ? query.state : '';

  let statePayload: { companyId: number; returnTo: string };
  try {
    statePayload = verifyOauthState(state);
  } catch {
    finishOauth(res, '', 'mp=error&reason=invalid_state');
    return;
  }
  const returnTo = SAFE_RETURN_TO.test(statePayload.returnTo) ? statePayload.returnTo : fallbackOrigin();

  if (typeof query.error === 'string') {
    finishOauth(res, returnTo, 'mp=error&reason=denied');
    return;
  }
  if (typeof query.code !== 'string' || !query.code) {
    finishOauth(res, returnTo, 'mp=error&reason=no_code');
    return;
  }

  try {
    const bundle = await exchangeAuthorizationCode(query.code);
    const email = await fetchSellerEmail(bundle.accessToken);
    await connectAccount(statePayload.companyId, bundle, email);
    finishOauth(res, returnTo, 'mp=connected');
  } catch (err) {
    console.error('[mp] error en el callback de OAuth:', err);
    finishOauth(res, returnTo, 'mp=error&reason=oauth_failed');
  }
}

export async function webhookHandler(req: Request, res: Response): Promise<void> {
  try {
    await processWebhook(req);
  } catch (err) {
    if (err instanceof AppError && (err.statusCode === 401 || err.statusCode >= 500)) {
      throw err;
    }
    console.error('[mp] error procesando webhook:', err);
  }
  res.status(200).json({ ok: true });
}

export async function createReservationOrderHandler(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  const input = regenerateSchema.parse(req.body ?? {});
  const companyId = getTenantId()!;
  const reservation = await getReservation(id);

  if (reservation.status === 'CANCELLED' || reservation.status === 'CHECKED_OUT') {
    throw conflict('INVALID_STATE', 'No se puede generar un link de pago para una reserva cancelada o finalizada');
  }

  if (!input.regenerate && reservation.mpCheckoutUrl) {
    res.json({ data: { reservation, generated: false } });
    return;
  }

  const result = await createOrderForReservation({
    companyId,
    code: reservation.code,
    amount: reservation.totals.total,
    guest: reservation.guest,
    checkIn: reservation.checkIn,
  });

  const updated = await prisma.reservation.update({
    where: { id },
    data: { mpOrderId: result.orderId, mpCheckoutUrl: result.checkoutUrl },
    include: {
      room: { include: { type: true } },
      guest: true,
      services: { include: { service: true } },
      payments: { orderBy: { paidAt: 'desc' } },
    },
  });

  res.json({ data: { reservation: serializeReservation(updated), generated: true } });
}