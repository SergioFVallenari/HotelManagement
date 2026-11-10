import type { PublicAvailability } from '../api/types.ts';
import { dateShort, money } from './format.ts';
import { serviceQuantityLabel } from './services.ts';

export function buildAvailabilityMessage(result: Pick<PublicAvailability, 'hotel' | 'stay' | 'combination'> & Partial<Pick<PublicAvailability, 'services'>>, roomTypeCount?: number): string {
  const { hotel, stay, combination } = result;
  const nights = `${stay.nights} ${stay.nights === 1 ? 'noche' : 'noches'}`;
  const persons = (count: number) => `${count} ${count === 1 ? 'persona' : 'personas'}`;
  const extraBeds = (count: number) => `${count} ${count === 1 ? 'cama extra' : 'camas extra'}`;
  const lines = [
    `¡Hola! Quisiera consultar por esta estadía en *${hotel.name}*:`,
    '',
    `*Entrada:* ${dateShort(stay.checkIn).replaceAll('-', '/')}`,
    `*Salida:* ${dateShort(stay.checkOut).replaceAll('-', '/')} · *${nights}*`,
    `*Huéspedes:* ${persons(stay.persons)}`,
  ];
  if (stay.roomType && roomTypeCount !== 1) lines.push(`*Tipo solicitado:* ${stay.roomType}`);
  if (stay.room) lines.push(`*Habitación seleccionada:* ${stay.room.number}${stay.room.name ? ` · ${stay.room.name}` : ''}`);
  if (combination) {
    lines.push('', `*${combination.roomCount} ${combination.roomCount === 1 ? `habitación ${combination.rooms[0]?.roomType ?? ''}`.trim() : 'habitaciones'}*`);
    combination.rooms.forEach((room, index) => {
      if (combination.roomCount > 1) lines.push(`Habitación ${index + 1}: ${room.roomType}`);
      lines.push(`Para ${persons(room.persons - room.extraBeds)}${room.extraBeds ? ` + ${extraBeds(room.extraBeds)}` : ''}.`);
    });
    lines.push('', `*Importes por ${stay.nights === 1 ? 'la noche' : `las ${nights}`}:*`);
    lines.push(`${combination.roomCount === 1 ? 'Habitación' : 'Habitaciones'}: ${money(combination.roomTotal)}`);
    if (combination.extraBeds) lines.push(`${combination.extraBeds === 1 ? 'Cama extra' : 'Camas extra'}: ${money(combination.extraBedsTotal)}`);
    result.services?.forEach((service) => {
      const detail = service.chargeType === 'PER_ROOM_INTERVAL' ? serviceQuantityLabel(service, stay, combination.roomCount) : service.chargeType === 'PER_PERSON' ? `${persons(stay.persons)} × ${nights}` : service.chargeType === 'PER_DAY' ? nights : `${service.quantity} ${service.quantity === 1 ? 'pack' : 'packs'}`;
      lines.push(`${service.name} (${detail}): ${money(service.lineTotal)}`);
      if (service.description) lines.push(`Incluye: ${service.description}`);
    });
    lines.push(`*Total estimado: ${money(combination.total)}*`);
  }
  if (!combination && result.services?.length) {
    lines.push('', '*Servicios solicitados:*');
    result.services.forEach((service) => {
      lines.push(service.chargeType === 'PER_ROOM_INTERVAL' ? `${service.name}: cada ${service.intervalDays} día(s), por habitación; importe a confirmar según disponibilidad.` : `${service.name} (${service.quantity} unidades): ${money(service.lineTotal)}`);
      if (service.description) lines.push(`Incluye: ${service.description}`);
    });
  }
  lines.push('', '¿Me confirman la disponibilidad y cómo puedo reservar?');
  return lines.join('\n');
}
