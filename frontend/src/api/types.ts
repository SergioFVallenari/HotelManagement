export interface RoomType {
  id: number;
  name: string;
  _count?: { rooms: number };
}

export interface Room {
  id: number;
  number: string;
  name: string | null;
  typeId: number;
  capacity: number;
  price: number;
  amenities: string[];
  isActive: boolean;
  type?: RoomType;
  _count?: { reservations: number };
}

export interface Guest {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  _count?: { reservations: number };
}

export type ServiceChargeType = 'PER_PERSON' | 'PER_DAY' | 'PACK';

export interface Service {
  id: number;
  name: string;
  price: number;
  chargeType: ServiceChargeType;
  isActive: boolean;
}

export type ReservationStatus = 'RESERVED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER';

export interface ReservationServiceLine {
  id: number;
  serviceId: number;
  name: string | null;
  chargeType: ServiceChargeType | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Payment {
  id: number;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  reference: string | null;
}

export interface ReservationTotals {
  nights: number;
  roomPrice: number;
  roomTotal: number;
  servicesTotal: number;
  total: number;
  amountPaid: number;
  balance: number;
}

export interface Reservation {
  id: number;
  code: string;
  roomId: number;
  guestId: number;
  checkIn: string;
  checkOut: string;
  persons: number;
  status: ReservationStatus;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  cancelledAt: string | null;
  refundEligible: boolean;
  refundAmount: number | null;
  refunded: boolean;
  refundedAt: string | null;
  notes: string | null;
  room?: { id: number; number: string; name: string | null; capacity: number; price: number; type?: RoomType } | null;
  guest?: Guest | null;
  services: ReservationServiceLine[];
  payments: Payment[];
  totals: ReservationTotals;
}

export interface Company {
  id: number;
  name: string;
}

export interface LoginCompany {
  id: number;
  name: string;
  role: 'ADMIN' | 'RECEPCIONISTA';
}

export interface User {
  id: number;
  username: string;
  role: 'ADMIN' | 'RECEPCIONISTA';
  name?: string | null;
  companyId: number;
}

export interface Summary {
  range: { from: string; to: string; days: number };
  occupancy: {
    occupancyPct: number;
    occupiedRoomNights: number;
    availableRoomNights: number;
    totalRoomNights: number;
  };
  revenue: { total: number; byMethod: Record<string, number> };
  reservationsPage: { created: number; checkIns: number; checkOuts: number };
  statusDistribution: { status: ReservationStatus; count: number }[];
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Page<T> {
  data: T[];
  meta: PageMeta;
}

export type CalendarStatus = 'AVAILABLE' | 'OCCUPIED' | 'TURNOVER';

export interface CalendarReservationRef {
  id: number;
  code: string;
  status: ReservationStatus;
  checkIn: string;
  checkOut: string;
  guestName: string;
}

export interface CalendarCell {
  status: CalendarStatus;
  reservations: CalendarReservationRef[];
}

export interface CalendarRoom {
  id: number;
  number: string;
  name: string | null;
  typeName: string | null;
  cells: CalendarCell[];
}

export interface CalendarData {
  from: string;
  to: string;
  days: string[];
  rooms: CalendarRoom[];
}