CREATE TABLE "MobileSession" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MobileSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MobileRefreshToken" (
    "hash" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MobileRefreshToken_pkey" PRIMARY KEY ("hash")
);

CREATE INDEX "MobileSession_userId_companyId_idx" ON "MobileSession"("userId", "companyId");
CREATE INDEX "MobileSession_expiresAt_idx" ON "MobileSession"("expiresAt");
CREATE INDEX "MobileRefreshToken_sessionId_idx" ON "MobileRefreshToken"("sessionId");
ALTER TABLE "MobileSession" ADD CONSTRAINT "MobileSession_userId_companyId_fkey" FOREIGN KEY ("userId", "companyId") REFERENCES "UserCompany"("userId", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MobileRefreshToken" ADD CONSTRAINT "MobileRefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MobileSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MobileSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MobileRefreshToken" ENABLE ROW LEVEL SECURITY;
