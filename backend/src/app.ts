import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './modules/auth/auth.routes.js';
import companyRoutes from './modules/companies/companies.routes.js';
import roomTypeRoutes from './modules/roomTypes/roomTypes.routes.js';
import roomRoutes from './modules/rooms/rooms.routes.js';
import guestRoutes from './modules/guests/guests.routes.js';
import serviceRoutes from './modules/services/services.routes.js';
import reservationRoutes from './modules/reservations/reservations.routes.js';
import paymentRoutes from './modules/payments/payments.routes.js';
import summaryRoutes from './modules/summary/summary.routes.js';
import calendarRoutes from './modules/calendar/calendar.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { env } from './config/env.js';

export function createApp(): express.Express {
  const app = express();
  app.use(cors({
    origin: env.corsOrigins,
    credentials: true,
  }));
  app.use(cookieParser());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/companies', companyRoutes);
  app.use('/api/room-types', roomTypeRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/guests', guestRoutes);
  app.use('/api/services', serviceRoutes);
  app.use('/api/reservations', reservationRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/summary', summaryRoutes);
  app.use('/api/calendar', calendarRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}