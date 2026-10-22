import { round2 } from '../../lib/money.js';

export interface ShareStay {
  hotelName: string;
  roomLabel: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  total: number;
  deposit: number;
  url: string;
}

export function formatArs(value: number): string {
  const rounded = round2(value);
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
  }).format(rounded);
}

export function formatDateShort(value: string): string {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function buildShareMessage(stay: ShareStay): string {
  return (
    `¡Hola! Te dejo el link para reservar en ${stay.hotelName}: ${stay.roomLabel}, ` +
    `del ${formatDateShort(stay.checkIn)} al ${formatDateShort(stay.checkOut)} (${stay.nights} ${stay.nights === 1 ? 'noche' : 'noches'}). ` +
    `Total $${formatArs(stay.total)}. ` +
    `Para reservar tenés que transferir $${formatArs(stay.deposit)}. ` +
    `${stay.url}`
  );
}

// Telefono en formato internacional para wa.me: solo digitos, con 54 adelante.
export function normalizeWhatsAppPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('54')) return digits;
  return `54${digits.startsWith('0') ? digits.slice(1) : digits}`;
}

export function buildWhatsAppUrl(message: string, phone?: string | null): string {
  const normalized = phone ? normalizeWhatsAppPhone(phone) : '';
  const base = normalized ? `https://wa.me/${normalized}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(message)}`;
}
