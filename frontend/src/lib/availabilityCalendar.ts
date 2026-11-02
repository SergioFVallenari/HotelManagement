export const calendarIso = (date: Date) => date.toISOString().slice(0, 10);

export const shiftCalendarDay = (day: string, offset: number) => calendarIso(new Date(Date.parse(`${day}T00:00:00Z`) + offset * 86400000));

export function calendarStayError(start: string, end: string, available: ReadonlyMap<string, boolean>): string | null {
  if (end <= start) return 'La salida debe ser posterior a la entrada.';
  if (end > shiftCalendarDay(start, 30)) return 'La estadía no puede superar las 30 noches.';
  for (let night = start; night < end; night = shiftCalendarDay(night, 1)) {
    if (!available.get(night)) return 'La habitación no está disponible durante toda esa estadía. Elegí otra salida o una nueva entrada.';
  }
  return null;
}
