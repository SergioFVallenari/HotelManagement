-- AlterEnum
ALTER TYPE "ReservationStatus" ADD VALUE 'PENDING';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'MERCADOPAGO';

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "mpPreferenceId" TEXT,
ADD COLUMN     "mpInitPoint" TEXT;

-- CreateTable
CREATE TABLE "CompanyMpAccount" (
    "id" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "mpUserId" TEXT NOT NULL,
    "mpEmail" TEXT,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRefreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyMpAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMpAccount_companyId_key" ON "CompanyMpAccount"("companyId");

-- CreateIndex
CREATE INDEX "CompanyMpAccount_companyId_idx" ON "CompanyMpAccount"("companyId");

-- AddForeignKey
ALTER TABLE "CompanyMpAccount" ADD CONSTRAINT "CompanyMpAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;