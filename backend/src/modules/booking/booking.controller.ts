import type { Request, Response } from 'express';
import { parseIdParam } from '../../lib/pagination.js';
import {
  cancelBookingLink,
  createBookingLink,
  createReceiptUpload,
  getBookingLink,
  getPublicQuote,
  getPublicReservationStatus,
  getPublicAvailability,
  getPublicBookingPageConfig,
  listBookingLinks,
  submitBooking,
} from './booking.service.js';
import {
  createBookingLinkSchema,
  listBookingLinksQuerySchema,
  publicBookingSchema,
  publicAvailabilityQuerySchema,
  receiptUploadSchema,
} from './booking.schema.js';
import type { CreateBookingLinkInput, ListBookingLinksQuery, PublicBookingInput, ReceiptUploadInput } from './booking.schema.js';

export async function listBookingLinksHandler(req: Request, res: Response): Promise<void> {
  const query = listBookingLinksQuerySchema.parse(req.query) as ListBookingLinksQuery;
  const data = await listBookingLinks(query);
  res.json({ data });
}

export async function createBookingLinkHandler(req: Request, res: Response): Promise<void> {
  const input = createBookingLinkSchema.parse(req.body) as CreateBookingLinkInput;
  const link = await createBookingLink(input);
  res.status(201).json({ data: link });
}

export async function getBookingLinkHandler(req: Request, res: Response): Promise<void> {
  const link = await getBookingLink(parseIdParam(req.params.id));
  res.json({ data: link });
}

export async function cancelBookingLinkHandler(req: Request, res: Response): Promise<void> {
  const link = await cancelBookingLink(parseIdParam(req.params.id));
  res.json({ data: link });
}

// --- endpoints publicos (el token del link es la credencial) ---

export async function getPublicQuoteHandler(req: Request, res: Response): Promise<void> {
  const data = await getPublicQuote(String(req.params.token));
  res.json({ data });
}

export async function getPublicReservationStatusHandler(req: Request, res: Response): Promise<void> {
  const data = await getPublicReservationStatus(String(req.params.code));
  res.json({ data });
}

export async function getPublicAvailabilityHandler(req: Request, res: Response): Promise<void> {
  const query = publicAvailabilityQuerySchema.parse(req.query);
  const data = await getPublicAvailability(String(req.params.slug), query);
  res.json({ data });
}

export async function getPublicBookingPageConfigHandler(req: Request, res: Response): Promise<void> {
  const data = await getPublicBookingPageConfig(String(req.params.slug));
  res.json({ data });
}

export async function createReceiptUploadHandler(req: Request, res: Response): Promise<void> {
  const input = receiptUploadSchema.parse(req.body) as ReceiptUploadInput;
  const data = await createReceiptUpload(String(req.params.token), input);
  res.status(201).json({ data });
}

export async function submitBookingHandler(req: Request, res: Response): Promise<void> {
  const input = publicBookingSchema.parse(req.body) as PublicBookingInput;
  const data = await submitBooking(String(req.params.token), input);
  res.status(201).json({ data });
}
