-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('APP', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('OPEN', 'CONFIRMED', 'CANCELLED');

-- AlterTable
ALTER TABLE "CardCharge" ADD COLUMN     "channel" "Channel" NOT NULL DEFAULT 'APP';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "channel" "Channel" NOT NULL DEFAULT 'APP';

-- CreateTable
CREATE TABLE "SourceAlias" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "alias" TEXT NOT NULL,
    "accountId" UUID,
    "cardId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantRule" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "pattern" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "createdVia" "Channel" NOT NULL DEFAULT 'APP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramLink" (
    "userId" UUID NOT NULL,
    "telegramUserId" BIGINT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "firstName" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "TelegramLink_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "TelegramLinkCode" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLinkCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotDraft" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "chatId" BIGINT NOT NULL,
    "messageId" INTEGER,
    "text" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "options" JSONB,
    "awaiting" TEXT,
    "status" "DraftStatus" NOT NULL DEFAULT 'OPEN',
    "resultType" TEXT,
    "resultId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramUpdate" (
    "updateId" BIGINT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramUpdate_pkey" PRIMARY KEY ("updateId")
);

-- CreateTable
CREATE TABLE "UnparsedMessage" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "error" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnparsedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceAlias_accountId_idx" ON "SourceAlias"("accountId");

-- CreateIndex
CREATE INDEX "SourceAlias_cardId_idx" ON "SourceAlias"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceAlias_userId_alias_key" ON "SourceAlias"("userId", "alias");

-- CreateIndex
CREATE INDEX "MerchantRule_categoryId_idx" ON "MerchantRule"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantRule_userId_pattern_key" ON "MerchantRule"("userId", "pattern");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLink_telegramUserId_key" ON "TelegramLink"("telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLinkCode_codeHash_key" ON "TelegramLinkCode"("codeHash");

-- CreateIndex
CREATE INDEX "TelegramLinkCode_userId_idx" ON "TelegramLinkCode"("userId");

-- CreateIndex
CREATE INDEX "BotDraft_chatId_status_idx" ON "BotDraft"("chatId", "status");

-- CreateIndex
CREATE INDEX "BotDraft_userId_idx" ON "BotDraft"("userId");

-- CreateIndex
CREATE INDEX "UnparsedMessage_userId_createdAt_idx" ON "UnparsedMessage"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "SourceAlias" ADD CONSTRAINT "SourceAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceAlias" ADD CONSTRAINT "SourceAlias_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceAlias" ADD CONSTRAINT "SourceAlias_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantRule" ADD CONSTRAINT "MerchantRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantRule" ADD CONSTRAINT "MerchantRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramLink" ADD CONSTRAINT "TelegramLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- An alias names exactly one account or one card (TXT-02).
ALTER TABLE "SourceAlias" ADD CONSTRAINT "SourceAlias_one_target_check"
  CHECK (("accountId" IS NULL) <> ("cardId" IS NULL));
