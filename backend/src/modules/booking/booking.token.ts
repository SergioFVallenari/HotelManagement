import { randomBytes } from 'node:crypto';

// El token es lo unico que separa al huesped invitado de cualquiera que
// encuentre el link: tiene que ser imposible de adivinar.
export const BOOKING_TOKEN_BYTES = 24;

export function generateBookingToken(): string {
  return randomBytes(BOOKING_TOKEN_BYTES).toString('base64url');
}
