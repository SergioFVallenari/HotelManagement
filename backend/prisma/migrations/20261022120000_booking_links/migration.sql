-- Reservas por WhatsApp: la recepcion prepara una solicitud con la cotizacion
-- congelada, la comparte por WhatsApp y el huesped completa sus datos y sube el
-- comprobante de pago. La reserva nace PENDING (PUBLIC_LINK) hasta que la
-- recepcion la aprueba.

-- CreateEnum
CREATE TYPE "ReservationSource" AS ENUM ('STAFF', 'PUBLIC_LINK');

-- CreateEnum
CREATE TYPE "BookingLinkStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "bookingDepositPercent" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN "whatsapp" TEXT,
ADD COLUMN "phone" TEXT;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN "source" "ReservationSource" NOT NULL DEFAULT 'STAFF';

-- CreateTable
CREATE TABLE "BookingLink" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "roomId" INTEGER NOT NULL,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "persons" INTEGER NOT NULL DEFAULT 1,
    "extraBeds" INTEGER NOT NULL DEFAULT 0,
    "services" JSONB NOT NULL DEFAULT '[]',
    "total" DECIMAL(10,2) NOT NULL,
    "deposit" DECIMAL(10,2) NOT NULL,
    "status" "BookingLinkStatus" NOT NULL DEFAULT 'OPEN',
    "reservationId" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BookingLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationReceipt" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "reservationId" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingLink_token_key" ON "BookingLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "BookingLink_reservationId_key" ON "BookingLink"("reservationId");

-- CreateIndex
CREATE INDEX "BookingLink_companyId_status_idx" ON "BookingLink"("companyId", "status");

-- CreateIndex
CREATE INDEX "BookingLink_companyId_createdAt_idx" ON "BookingLink"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationReceipt_reservationId_key" ON "ReservationReceipt"("reservationId");

-- CreateIndex
CREATE INDEX "ReservationReceipt_companyId_idx" ON "ReservationReceipt"("companyId");

-- CreateIndex
CREATE INDEX "Reservation_companyId_source_idx" ON "Reservation"("companyId", "source");

-- AddForeignKey
ALTER TABLE "BookingLink" ADD CONSTRAINT "BookingLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingLink" ADD CONSTRAINT "BookingLink_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingLink" ADD CONSTRAINT "BookingLink_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationReceipt" ADD CONSTRAINT "ReservationReceipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationReceipt" ADD CONSTRAINT "ReservationReceipt_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS deny-by-default para anon/authenticated (mismo criterio que el resto de
-- las tablas de app): el backend entra como postgres (owner) y bypasea RLS.
ALTER TABLE "BookingLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReservationReceipt" ENABLE ROW LEVEL SECURITY;
