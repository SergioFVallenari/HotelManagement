import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/AppError.js';

// Los comprobantes de pago viven en un bucket privado de Supabase Storage.
// El huesped sube el archivo directamente a Storage con una URL firmada que
// le da el backend: asi el binario no pasa por la Lambda (que tiene el techo
// de 6 MB del payload de Function URLs) y el backend no parsea multipart.
export const RECEIPTS_BUCKET = 'booking-receipts';
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const storage = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

let bucketReady: Promise<void> | null = null;

// El bucket se crea la primera vez que se usa (asi no hace falta un paso de
// infra previo). Si ya existe, el error se ignora.
async function ensureReceiptsBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { error } = await storage.storage.createBucket(RECEIPTS_BUCKET, {
        public: false,
        fileSizeLimit: MAX_RECEIPT_BYTES,
        allowedMimeTypes: ALLOWED_RECEIPT_TYPES,
      });
      if (error && !/already exists/i.test(error.message)) {
        throw new AppError(502, 'STORAGE_UNAVAILABLE', 'No se pudo preparar el almacenamiento de comprobantes');
      }
    })();
  }
  return bucketReady;
}

export interface SignedUploadUrl {
  signedUrl: string;
  token: string;
}

export async function createReceiptUploadUrl(path: string): Promise<SignedUploadUrl> {
  await ensureReceiptsBucket();
  const { data, error } = await storage.storage.from(RECEIPTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    throw new AppError(502, 'STORAGE_UNAVAILABLE', 'No se pudo preparar la subida del comprobante');
  }
  return { signedUrl: data.signedUrl, token: data.token };
}

export interface ReceiptObjectInfo {
  exists: boolean;
  size: number;
  contentType: string;
}

// Metadata real del objeto subido (tamaño y tipo): lo que declara el cliente
// no se usa, se verifica contra lo que hay en Storage.
export async function getReceiptInfo(path: string): Promise<ReceiptObjectInfo> {
  const { data, error } = await storage.storage.from(RECEIPTS_BUCKET).info(path);
  if (error || !data) return { exists: false, size: 0, contentType: '' };
  return {
    exists: true,
    size: data.size ?? 0,
    contentType: data.contentType ?? '',
  };
}

export async function removeReceipt(path: string): Promise<void> {
  const { error } = await storage.storage.from(RECEIPTS_BUCKET).remove([path]);
  if (error) console.warn('[booking] no se pudo borrar el comprobante:', error.message);
}

export async function createReceiptUrl(path: string, ttlSeconds = 120): Promise<string> {
  const { data, error } = await storage.storage.from(RECEIPTS_BUCKET).createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) {
    throw new AppError(500, 'STORAGE_URL_FAILED', 'No se pudo generar el enlace del comprobante');
  }
  return data.signedUrl;
}

export function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'application/pdf':
      return '.pdf';
    default:
      return '';
  }
}

export function mimeTypeForPath(path: string): string {
  const match = ALLOWED_RECEIPT_TYPES.find((type) => path.endsWith(extensionForMimeType(type)));
  return match ?? '';
}
