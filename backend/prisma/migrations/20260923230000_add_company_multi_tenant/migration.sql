-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- Insert a default company and backfill all existing rows into it.
INSERT INTO "Company" ("id", "name", "createdAt", "updatedAt") VALUES (1, 'Hotel Principal', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
SELECT setval(pg_get_serial_sequence('"Company"', 'id'), (SELECT MAX("id") FROM "Company"));

-- Add the tenant column to every scoped model (nullable first, to backfill existing data).
ALTER TABLE "User" ADD COLUMN "companyId" INTEGER;
ALTER TABLE "RoomType" ADD COLUMN "companyId" INTEGER;
ALTER TABLE "Room" ADD COLUMN "companyId" INTEGER;
ALTER TABLE "Guest" ADD COLUMN "companyId" INTEGER;
ALTER TABLE "Service" ADD COLUMN "companyId" INTEGER;
ALTER TABLE "Reservation" ADD COLUMN "companyId" INTEGER;

-- Assign all existing rows to the default company.
UPDATE "User" SET "companyId" = 1;
UPDATE "RoomType" SET "companyId" = 1;
UPDATE "Room" SET "companyId" = 1;
UPDATE "Guest" SET "companyId" = 1;
UPDATE "Service" SET "companyId" = 1;
UPDATE "Reservation" SET "companyId" = 1;

ALTER TABLE "User" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "RoomType" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Room" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Guest" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Service" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Reservation" ALTER COLUMN "companyId" SET NOT NULL;

-- Drop the previously global unique constraints.
DROP INDEX "User_username_key";
DROP INDEX "RoomType_name_key";
DROP INDEX "Room_number_key";
DROP INDEX "Guest_email_key";
DROP INDEX "Service_name_key";

-- Replace them with per-company unique constraints.
CREATE UNIQUE INDEX "User_companyId_username_key" ON "User"("companyId", "username");
CREATE UNIQUE INDEX "RoomType_companyId_name_key" ON "RoomType"("companyId", "name");
CREATE UNIQUE INDEX "Room_companyId_number_key" ON "Room"("companyId", "number");
CREATE UNIQUE INDEX "Guest_companyId_email_key" ON "Guest"("companyId", "email");
CREATE UNIQUE INDEX "Service_companyId_name_key" ON "Service"("companyId", "name");

-- Tenant lookup indexes.
CREATE INDEX "User_companyId_idx" ON "User"("companyId");
CREATE INDEX "RoomType_companyId_idx" ON "RoomType"("companyId");
CREATE INDEX "Room_companyId_idx" ON "Room"("companyId");
CREATE INDEX "Guest_companyId_idx" ON "Guest"("companyId");
CREATE INDEX "Service_companyId_idx" ON "Service"("companyId");
CREATE INDEX "Reservation_companyId_code_idx" ON "Reservation"("companyId", "code");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoomType" ADD CONSTRAINT "RoomType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Service" ADD CONSTRAINT "Service_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;