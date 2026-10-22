-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'AIRBNB');

-- CreateEnum
CREATE TYPE "ChannelAccountStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "ChannelDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "ChannelMessageStatus" AS ENUM ('RECEIVED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "ChannelContentType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'FILE', 'STORY', 'SHARE', 'REACTION', 'SYSTEM');

-- CreateTable
CREATE TABLE "ChannelAccount" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "handle" TEXT,
    "displayName" TEXT,
    "accessTokenEnc" TEXT,
    "accessTokenIv" TEXT,
    "refreshTokenEnc" TEXT,
    "refreshTokenIv" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "status" "ChannelAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelConversation" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalThreadId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "participantHandle" TEXT,
    "participantName" TEXT,
    "participantAvatar" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "lastInboundAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelMessage" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "conversationId" TEXT NOT NULL,
    "externalMessageId" TEXT NOT NULL,
    "direction" "ChannelDirection" NOT NULL,
    "contentType" "ChannelContentType" NOT NULL DEFAULT 'TEXT',
    "text" TEXT,
    "attachments" JSONB,
    "replyToExternalId" TEXT,
    "status" "ChannelMessageStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelAccount_companyId_channel_key" ON "ChannelAccount"("companyId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelAccount_channel_externalAccountId_key" ON "ChannelAccount"("channel", "externalAccountId");

-- CreateIndex
CREATE INDEX "ChannelAccount_companyId_idx" ON "ChannelAccount"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConversation_accountId_externalThreadId_key" ON "ChannelConversation"("accountId", "externalThreadId");

-- CreateIndex
CREATE INDEX "ChannelConversation_companyId_lastMessageAt_idx" ON "ChannelConversation"("companyId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ChannelConversation_companyId_channel_lastMessageAt_idx" ON "ChannelConversation"("companyId", "channel", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelMessage_externalMessageId_key" ON "ChannelMessage"("externalMessageId");

-- CreateIndex
CREATE INDEX "ChannelMessage_conversationId_sentAt_idx" ON "ChannelMessage"("conversationId", "sentAt");

-- CreateIndex
CREATE INDEX "ChannelMessage_companyId_sentAt_idx" ON "ChannelMessage"("companyId", "sentAt");

-- AddForeignKey
ALTER TABLE "ChannelAccount" ADD CONSTRAINT "ChannelAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelConversation" ADD CONSTRAINT "ChannelConversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelConversation" ADD CONSTRAINT "ChannelConversation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChannelAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelMessage" ADD CONSTRAINT "ChannelMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChannelConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrar conexiones existentes de Instagram a la capa generica de canales
INSERT INTO "ChannelAccount" (
    "id", "companyId", "channel", "externalAccountId", "handle",
    "accessTokenEnc", "accessTokenIv", "tokenExpiresAt", "status",
    "metadata", "connectedAt", "createdAt", "updatedAt"
)
SELECT
    "id",
    "companyId",
    'INSTAGRAM'::"ChannelType",
    "igBusinessAccountId",
    "username",
    "accessTokenEnc",
    "accessTokenIv",
    "tokenExpiresAt",
    CASE WHEN "active" THEN 'ACTIVE'::"ChannelAccountStatus" ELSE 'REVOKED'::"ChannelAccountStatus" END,
    jsonb_build_object('igUserId', "igBusinessAccountId"),
    "connectedAt",
    "createdAt",
    "updatedAt"
FROM "InstagramIntegration";

-- DropTable
DROP TABLE "InstagramIntegration";

-- RLS deny-by-default (sin policies). El owner "postgres" bypasea RLS.
ALTER TABLE "ChannelAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChannelConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChannelMessage" ENABLE ROW LEVEL SECURITY;
