export interface PaidPeriod {
  startsAt: Date;
  endsAt: Date;
}

function validDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

export function trialIsActive(trialEndsAt: Date | null, now: Date): boolean {
  if (!validDate(now) || (trialEndsAt && !validDate(trialEndsAt))) throw new Error('La fecha de prueba no es válida');
  return trialEndsAt !== null && now.getTime() < trialEndsAt.getTime();
}

export function calculateMonthlyPaidPeriod(input: { paidAt: Date; trialEndsAt: Date | null; previousPeriodEnd: Date | null }): PaidPeriod {
  const dates = [input.paidAt, input.trialEndsAt, input.previousPeriodEnd].filter((date): date is Date => date !== null);
  if (dates.some((date) => !validDate(date))) throw new Error('Las fechas del período no son válidas');
  const startsAt = new Date(Math.max(...dates.map((date) => date.getTime())));
  const nextMonth = new Date(startsAt.getTime());
  const day = nextMonth.getUTCDate();
  nextMonth.setUTCDate(1);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 0)).getUTCDate();
  nextMonth.setUTCDate(Math.min(day, lastDay));
  return { startsAt, endsAt: nextMonth };
}
