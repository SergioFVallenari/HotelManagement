export type MercadoPagoBillingTopic = 'subscription_preapproval' | 'subscription_authorized_payment' | 'payment';

export interface MercadoPagoBillingNotification {
  topic: MercadoPagoBillingTopic;
  resourceId: string;
  notificationId: string | null;
  action: string | null;
  liveMode: boolean | null;
}

function identifier(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 200 ? normalized : null;
}

export function parseMercadoPagoBillingNotification(value: unknown): MercadoPagoBillingNotification | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if ('live_mode' in payload && typeof payload.live_mode !== 'boolean') return null;
  if (payload.type !== 'subscription_preapproval' && payload.type !== 'subscription_authorized_payment' && payload.type !== 'payment') return null;
  if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) return null;
  const resourceId = identifier((payload.data as Record<string, unknown>).id);
  if (!resourceId) return null;
  return {
    topic: payload.type,
    resourceId,
    notificationId: identifier(payload.id),
    action: typeof payload.action === 'string' && payload.action.trim() ? payload.action.trim().slice(0, 200) : null,
    liveMode: typeof payload.live_mode === 'boolean' ? payload.live_mode : null,
  };
}
