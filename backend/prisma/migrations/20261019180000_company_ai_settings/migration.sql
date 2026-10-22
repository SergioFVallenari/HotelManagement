-- CreateTable
CREATE TABLE "CompanyAiSetting" (
    "companyId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "autoReply" BOOLEAN NOT NULL DEFAULT true,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyAiSetting_pkey" PRIMARY KEY ("companyId")
);

-- AddForeignKey
ALTER TABLE "CompanyAiSetting" ADD CONSTRAINT "CompanyAiSetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
