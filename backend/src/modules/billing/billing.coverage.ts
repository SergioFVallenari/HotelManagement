export const TRIAL_MAX_HOTELS = 3;

export type CoverageDecision = {
  covered: boolean;
  maximum: number;
  coveredCount: number;
  remaining: number;
};

export function evaluateHotelCoverage(input: {
  hotelId: number;
  coveredHotelIds: readonly number[];
  maximum: number;
}): CoverageDecision {
  if (!Number.isSafeInteger(input.maximum) || input.maximum < 0) throw new Error('El límite de hoteles no es válido');
  if (!Number.isSafeInteger(input.hotelId) || input.hotelId <= 0) throw new Error('El hotel no es válido');
  if (input.coveredHotelIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new Error('La cobertura contiene hoteles inválidos');
  const hotels = new Set(input.coveredHotelIds);
  return {
    covered: hotels.has(input.hotelId),
    maximum: input.maximum,
    coveredCount: hotels.size,
    remaining: Math.max(0, input.maximum - hotels.size),
  };
}

export function canCoverAdditionalHotel(input: {
  hotelId: number;
  coveredHotelIds: readonly number[];
  maximum: number;
}): boolean {
  const coverage = evaluateHotelCoverage(input);
  return coverage.covered || coverage.remaining > 0;
}
