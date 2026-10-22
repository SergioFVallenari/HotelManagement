-- CreateTable
CREATE TABLE "InstagramIntegration" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "pageId" TEXT NOT NULL,
    "igBusinessAccountId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "accessTokenIv" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramIntegration_companyId_key" ON "InstagramIntegration"("companyId");

-- CreateIndex
CREATE INDEX "InstagramIntegration_companyId_idx" ON "InstagramIntegration"("companyId");

-- AddForeignKey
ALTER TABLE "InstagramIntegration" ADD CONSTRAINT "InstagramIntegration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
