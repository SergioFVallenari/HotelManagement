import { normalizeAiText } from './aiReservation.selection.js';

interface GuestCandidate {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}

export function resolveAiGuest<T extends GuestCandidate>(guests: T[], input: { email: string | null; phone: string | null; guestId: number | null; newGuest: boolean }): { guest: T | null; question: string | null } {
  if (input.newGuest) return { guest: null, question: null };
  const matches = guests.filter((guest) => (!input.email || normalizeAiText(guest.email ?? '') === normalizeAiText(input.email))
    && (!input.phone || (guest.phone ?? '').replace(/\D/g, '') === input.phone.replace(/\D/g, '')));
  if (input.guestId !== null) {
    const guest = matches.find((candidate) => candidate.id === input.guestId);
    return guest ? { guest, question: null } : { guest: null, question: 'El huésped elegido no coincide con los datos del pedido. Elegí una ficha de la lista o indicá «crear un huésped nuevo».' };
  }
  if (matches.length > 1) {
    const options = matches.map((guest) => `Ficha ${guest.id}: ${guest.firstName} ${guest.lastName} · ${guest.email ?? 'sin email'} · ${guest.phone ?? 'sin teléfono'}`).join('\n');
    return { guest: null, question: `Hay varios huéspedes con ese nombre. Elegí el número de ficha o indicá «crear un huésped nuevo», sin necesidad de contacto:\n${options}` };
  }
  return { guest: matches[0] ?? null, question: null };
}
