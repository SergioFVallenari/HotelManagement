import type { PublicAvailability } from '../api/types.ts';

export function selectAvailabilityOption(result: PublicAvailability, roomType: string): PublicAvailability {
  const option = result.options.find((item) => item.roomType === roomType);
  if (!option) throw new Error('La opción de alojamiento elegida no está disponible.');
  return {
    ...result,
    stay: { ...result.stay, roomType: option.roomType },
    combination: option.combination,
    services: option.services,
    servicesTotal: option.servicesTotal,
  };
}
