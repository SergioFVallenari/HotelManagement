import type { PublicAvailability } from '../api/types.ts';
import { dateShort, money } from './format.ts';

export function buildAvailabilityMessage(result: Pick<PublicAvailability, 'hotel' | 'stay' | 'combination'>): string {
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
  if (combination) {
    lines.push('', `*${combination.roomCount} ${combination.roomCount === 1 ? `habitación ${combination.rooms[0]?.roomType ?? ''}`.trim() : 'habitaciones'}*`);
    combination.rooms.forEach((room, index) => {
      if (combination.roomCount > 1) lines.push(`Habitación ${index + 1}: ${room.roomType}`);
      lines.push(`Para ${persons(room.persons - room.extraBeds)}${room.extraBeds ? ` + ${extraBeds(room.extraBeds)}` : ''}.`);
    });
    lines.push('', `*Importes por ${stay.nights === 1 ? 'la noche' : `las ${nights}`}:*`);
    lines.push(`${combination.roomCount === 1 ? 'Habitación' : 'Habitaciones'}: ${money(combination.roomTotal)}`);
    if (combination.extraBeds) lines.push(`${combination.extraBeds === 1 ? 'Cama extra' : 'Camas extra'}: ${money(combination.extraBedsTotal)}`);
    lines.push(`*Total estimado: ${money(combination.total)}*`);
  }
  lines.push('', '¿Me confirman la disponibilidad y cómo puedo reservar?');
  return lines.join('\n');
}
