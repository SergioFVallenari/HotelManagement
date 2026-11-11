BEGIN;

CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

CREATE TYPE "NotificationEvent" AS ENUM ('RESERVATION_PENDING', 'RESERVATION_CONFIRMED', 'RESERVATION_CANCELLED');

CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "reservationId" INTEGER NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationOutbox_status_nextAttemptAt_idx" ON "NotificationOutbox"("status", "nextAttemptAt");

CREATE INDEX "NotificationOutbox_companyId_idx" ON "NotificationOutbox"("companyId");

CREATE UNIQUE INDEX "NotificationOutbox_reservationId_event_key" ON "NotificationOutbox"("reservationId", "event");

ALTER TABLE "NotificationOutbox" ENABLE ROW LEVEL SECURITY;

COMMIT;
