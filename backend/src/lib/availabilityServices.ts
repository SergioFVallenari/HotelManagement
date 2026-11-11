import { badRequest } from './AppError.js';
import { round2 } from './money.js';
import { serviceQuantity } from './pricing.js';

export interface PublicService {
  id: number;
  name: string;
  description?: string | null;
  intervalDays?: number | null;
  price: number;
  chargeType: 'PER_PERSON' | 'PER_DAY' | 'PACK' | 'PER_ROOM_INTERVAL';
}

export function quoteAvailabilityServices(available: PublicService[], selected: { serviceId: number; quantity?: number }[], persons: number, nights: number, roomCount = 1) {
  const services = selected.map((line) => {
    const service = available.find((item) => item.id === line.serviceId);
    if (!service) throw badRequest('Uno de los servicios elegidos ya no está disponible para la consulta pública');
    const quantity = serviceQuantity(service.chargeType, { persons, nights, extraBeds: 0, roomCount }, service.chargeType === 'PACK' ? line.quantity : undefined, false, service.intervalDays);
    return { serviceId: service.id, name: service.name, description: service.description ?? null, intervalDays: service.intervalDays ?? null, chargeType: service.chargeType, quantity, unitPrice: service.price, lineTotal: round2(quantity * service.price) };
  });
  return { services, servicesTotal: round2(services.reduce((sum, line) => sum + line.lineTotal, 0)) };
}
