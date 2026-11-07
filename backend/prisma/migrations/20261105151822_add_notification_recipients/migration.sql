-- CreateTable
CREATE TABLE "CompanyNotificationRecipient" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyNotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyNotificationRecipient_companyId_enabled_idx" ON "CompanyNotificationRecipient"("companyId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyNotificationRecipient_companyId_email_key" ON "CompanyNotificationRecipient"("companyId", "email");

-- AddForeignKey
ALTER TABLE "CompanyNotificationRecipient" ADD CONSTRAINT "CompanyNotificationRecipient_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
