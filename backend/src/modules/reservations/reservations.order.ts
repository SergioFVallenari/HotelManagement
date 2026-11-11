export interface ReservationOrderKey {
  id: number;
  checkIn: Date;
}

export function nearestReservationIds(rows: ReservationOrderKey[], today: Date, skip: number, take: number): number[] {
  const todayMs = today.getTime();
  return [...rows].sort((a, b) => {
    const aTime = a.checkIn.getTime();
    const bTime = b.checkIn.getTime();
    return Math.abs(aTime - todayMs) - Math.abs(bTime - todayMs) || bTime - aTime || b.id - a.id;
  }).slice(skip, skip + take).map((row) => row.id);
}
