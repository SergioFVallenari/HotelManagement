export interface CalendarReservation {
  id: number;
  code: string;
  status: string;
  checkIn: string;
  checkOut: string;
  guestName: string;
}

export function calendarRoomIds(reservation: { roomId: number; rooms: { roomId: number }[] }) {
  return [...new Set([reservation.roomId, ...reservation.rooms.map((line) => line.roomId)])];
}

export function calendarCells(days: string[], reservations: CalendarReservation[]) {
  return days.map((day) => {
    const occupied = reservations.filter((reservation) => reservation.checkIn <= day && day < reservation.checkOut);
    const checkIns = reservations.filter((reservation) => reservation.checkIn === day);
    const checkOuts = reservations.filter((reservation) => reservation.checkOut === day);
    if (checkIns.length && checkOuts.length) return { status: 'TURNOVER' as const, reservations: [...checkOuts, ...checkIns] };
    if (occupied.length) return { status: 'OCCUPIED' as const, reservations: occupied };
    return { status: 'AVAILABLE' as const, reservations: [] };
  });
}

export function publicCalendarData(calendar: {
  from: string; to: string; days: string[];
  rooms: { id: number; number: string; name: string | null; capacity: number; maxExtraBeds: number; typeName: string | null; cells: { status: string }[] }[];
}) {
  return {
    from: calendar.from, to: calendar.to, days: calendar.days,
    rooms: calendar.rooms.map((room) => ({
      id: room.id, number: room.number, name: room.name, typeName: room.typeName,
      capacity: room.capacity, maxExtraBeds: room.maxExtraBeds,
      cells: room.cells.map((cell) => ({ available: cell.status === 'AVAILABLE' })),
    })),
  };
}
