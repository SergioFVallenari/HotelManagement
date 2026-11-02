import { money } from './format.ts';
import { intervalServiceOccurrences } from './pricing.ts';

interface ServiceTerms {
  chargeType?: string | null;
  intervalDays?: number | null;
}

function units(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function serviceRateLabel(service: ServiceTerms & { price: number }): string {
  const unit = service.chargeType === 'PER_ROOM_INTERVAL'
    ? `por habitación e intervención · cada ${units(service.intervalDays ?? 0, 'día', 'días')}`
    : service.chargeType === 'PER_PERSON' ? 'por persona y noche' : service.chargeType === 'PER_DAY' ? 'por noche' : 'por pack';
  return `${money(service.price)} ${unit}`;
}

export function serviceQuantityLabel(service: ServiceTerms & { quantity: number }, stay: { persons: number; nights: number }, roomCount: number): string {
  if (service.chargeType === 'PER_ROOM_INTERVAL') {
    const occurrences = intervalServiceOccurrences(stay.nights, service.intervalDays);
    return `Cada ${units(service.intervalDays ?? 0, 'día', 'días')}: ${units(roomCount, 'habitación', 'habitaciones')} × ${units(occurrences, 'intervención', 'intervenciones')}, sin incluir el día de salida`;
  }
  if (service.chargeType === 'PER_PERSON') return `${units(stay.persons, 'persona', 'personas')} × ${units(stay.nights, 'noche', 'noches')}`;
  if (service.chargeType === 'PER_DAY') return units(stay.nights, 'noche', 'noches');
  return `${service.quantity} ${service.quantity === 1 ? 'pack' : 'packs'}`;
}
