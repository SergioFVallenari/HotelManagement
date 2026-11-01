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
  maxExtraBeds: number;
  price: number;
  pricingMode: 'PER_NIGHT' | 'PER_PERSON';
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
  isExtraBed: boolean;
  isActive: boolean;
}

export type ReservationStatus = 'PENDING' | 'RESERVED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'MERCADOPAGO';

export interface ReservationServiceLine {
  id: number;
  serviceId: number;
  name: string | null;
  chargeType: ServiceChargeType | null;
  isExtraBed: boolean;
  personsCovered: number | null;
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

export type ReservationSource = 'STAFF' | 'PUBLIC_LINK';
export type BookingLinkStatus = 'OPEN' | 'COMPLETED' | 'CANCELLED';

export interface ReservationReceipt {
  id: number;
  fileName: string;
  mimeType: string;
  size: number;
  externalRef: string | null;
  createdAt: string;
}

export interface Reservation {
  id: number;
  code: string;
  roomId: number;
  rooms?: { roomId: number; persons: number; extraBeds: number; roomPrice: number; roomPricingMode: 'PER_NIGHT' | 'PER_PERSON'; total: number; room: Reservation['room'] }[];
  guestId: number;
  checkIn: string;
  checkOut: string;
  persons: number;
  extraBeds: number;
  status: ReservationStatus;
  source: ReservationSource;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  cancelledAt: string | null;
  refundEligible: boolean;
  refundAmount: number | null;
  refunded: boolean;
  refundedAt: string | null;
  mpCheckoutUrl?: string | null;
  notes: string | null;
  room?: { id: number; number: string; name: string | null; capacity: number; price: number; pricingMode: 'PER_NIGHT' | 'PER_PERSON'; type?: RoomType } | null;
  guest?: Guest | null;
  services: ReservationServiceLine[];
  payments: Payment[];
  receipt?: ReservationReceipt | null;
  bookingLink?: { id: number; token: string; status: BookingLinkStatus; deposit: number; expiresAt: string | null } | null;
  totals: ReservationTotals;
}

export interface ReservationReceiptDetail {
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
  externalRef: string | null;
  createdAt: string;
}

export interface BookingLinkLine {
  serviceId: number;
  name: string;
  chargeType: ServiceChargeType;
  quantity: number;
  personsCovered: number | null;
  unitPrice: number;
  lineTotal: number;
}

export interface BookingLink {
  id: number;
  token: string;
  url: string;
  status: BookingLinkStatus;
  checkIn: string;
  checkOut: string;
  nights: number;
  persons: number;
  extraBeds: number;
  rooms?: { roomId: number; persons: number; extraBeds: number; roomPrice: number; roomPricingMode: 'PER_NIGHT' | 'PER_PERSON'; number: string; typeName: string; capacity: number; amenities?: string[] }[];
  room: { id: number; number: string; typeName: string | null; capacity: number; price: number; pricingMode: 'PER_NIGHT' | 'PER_PERSON'; label: string; amenities?: string[] } | null;
  services: BookingLinkLine[];
  totals: { roomTotal: number; servicesTotal: number; total: number; deposit: number; balance: number };
  roomPricingMode?: 'PER_NIGHT' | 'PER_PERSON';
  expiresAt: string | null;
  createdAt: string;
  completedAt: string | null;
  reservation: { id: number; code: string; status: ReservationStatus } | null;
  share: { message: string; whatsappUrl: string } | null;
}

export interface PublicBookingQuote {
  hotel: { name: string; whatsapp: string | null; phone: string | null; bookingTheme?: Partial<BookingTheme> | null; slug: string };
  stay: {
    checkIn: string;
    checkOut: string;
    nights: number;
    persons: number;
    extraBeds: number;
    roomType: string;
    roomCapacity: number | null;
    rooms?: { roomType: string; capacity: number; persons: number; extraBeds: number; total: number }[];
    roomPricingMode: 'PER_NIGHT' | 'PER_PERSON';
  };
  services: { name: string; quantity: number; unitPrice: number; lineTotal: number }[];
  totals: { roomTotal: number; servicesTotal: number; total: number; deposit: number; balance: number };
  expiresAt: string | null;
  expired: boolean;
}

export interface PublicAvailability {
  availableRoomCount: number;
  combination: {
    roomCount: number;
    persons: number;
    total: number;
    extraBeds: number;
    roomTotal: number;
    extraBedsTotal: number;
    extraBedService: { name: string; price: number; chargeType: 'PER_DAY' | 'PER_PERSON' | 'PACK' } | null;
    rooms: { roomType: string; capacity: number; persons: number; total: number; extraBeds: number; roomTotal: number; extraBedsTotal: number; amenities?: string[] }[];
  } | null;
  availableRoomCapacity: number;
  hotel: { name: string; whatsapp: string | null; phone: string | null; bookingTheme?: Partial<BookingTheme> | null };
  stay: { checkIn: string; checkOut: string; nights: number; persons: number; includesExtraBeds: boolean };
  options: { roomType: string; available: number; capacity: number; fromPrice: number; total: number, amenities?: string[] }[];
}

export interface PublicBookingPageConfig {
  hotel: { name: string; whatsapp: string | null; phone: string | null; bookingTheme?: Partial<BookingTheme> | null; hotelCapacity: number; maxAvailabilityPersons: number; maxAvailabilityPersonsWithExtraBeds: number; publicExtraBedsEnabled: boolean; roomCount: number };
}

export interface ReceiptUploadUrl {
  path: string;
  signedUrl: string;
  token: string;
}

export interface CompanySettings {
  id: number;
  name: string;
  whatsapp: string | null;
  phone: string | null;
  bookingDepositPercent: number;
  bookingSlug: string | null;
  configPage: { bookingTheme?: Partial<BookingTheme>; maxAvailabilityPersons?: number | null; publicExtraBeds?: { enabled: boolean; serviceId: number | null } };
  hotelCapacity: number;
  hotelCapacityWithExtraBeds?: number;
  maxAvailabilityPersons: number;
}

export interface Company {
  id: number;
  name: string;
}

export interface MpConnection {
  connected: boolean;
  mpUserId?: string;
  mpEmail?: string | null;
  connectedAt?: string;
  lastRefreshedAt?: string;
}

export type UserRole = 'OWNER' | 'ADMIN' | 'RECEPCIONISTA';

export interface LoginCompany {
  id: number;
  name: string;
  role: UserRole;
}

export interface User {
  id: number;
  username: string;
  role: UserRole;
  name?: string | null;
  email?: string | null;
  companyId: number;
  companyName: string
}

export interface UserListItem {
  id: number;
  username: string;
  name?: string | null;
  email?: string | null;
  isActive: boolean;
  createdAt: string;
  role: UserRole;
  companyName?: string;
}

export interface SummaryDailyPoint {
  date: string;
  revenue: number;
  created: number;
  checkIns: number;
  checkOuts: number;
  occupiedRoomNights: number;
  occupancyPct: number;
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
  daily: SummaryDailyPoint[];
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

export type ChannelType = 'INSTAGRAM' | 'FACEBOOK' | 'AIRBNB';
export type ChannelDirection = 'IN' | 'OUT';
export type ChannelMessageStatus = 'RECEIVED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'DELETED';
export type ChannelContentType =
  | 'TEXT'
  | 'IMAGE'
  | 'VIDEO'
  | 'AUDIO'
  | 'FILE'
  | 'STORY'
  | 'SHARE'
  | 'REACTION'
  | 'SYSTEM';

export interface ChannelConversation {
  id: string;
  channel: ChannelType;
  externalThreadId: string;
  participantId: string;
  participantHandle: string | null;
  participantName: string | null;
  participantAvatar: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastInboundAt: string | null;
  unreadCount: number;
  replyWindowEndsAt: string | null;
  canReply: boolean;
}

export interface ChannelAttachment {
  type: ChannelContentType;
  url?: string;
  name?: string;
  mimeType?: string;
}

export interface ChannelMessage {
  id: string;
  conversationId: string;
  externalMessageId: string;
  direction: ChannelDirection;
  contentType: ChannelContentType;
  text: string | null;
  attachments: ChannelAttachment[] | null;
  status: ChannelMessageStatus;
  sentAt: string;
}

export interface MessageThread {
  data: ChannelMessage[];
  meta: { hasMore: boolean };
}

export interface AiConfig {
  configured: boolean;
}

export interface AiSettings {
  enabled: boolean;
  autoReply: boolean;
  instructions: string | null;
}

export interface AiDraft {
  action: 'auto' | 'suggest';
  reply: string;
  canReply: boolean;
}
import type { BookingTheme } from '../lib/bookingTheme';
