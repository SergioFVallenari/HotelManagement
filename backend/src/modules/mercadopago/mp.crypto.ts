import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppError } from '../../lib/AppError.js';
import { env } from '../../config/env.js';

function encryptionKey(): Buffer {
  const hex = env.mp.tokenEncryptionKey;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new AppError(500, 'MP_ENC_KEY_MISSING', 'Falta MP_TOKEN_ENCRYPTION_KEY (64 caracteres hex) para cifrar los tokens de MercadoPago');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptSecret(plain: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join('.');
}

export function decryptSecret(payload: string): string {
  const key = encryptionKey();
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new AppError(500, 'MP_ENC_BAD_FORMAT', 'El token de MercadoPago almacenado está en un formato inválido');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new AppError(500, 'MP_ENC_DECRYPT_FAILED', 'No se pudo desencriptar el token de MercadoPago almacenado');
  }
}