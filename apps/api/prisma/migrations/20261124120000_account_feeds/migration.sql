-- Iteration 14: connections with institutions (Mercado Pago), ADR 0037 and 0039.

-- CreateEnum
CREATE TYPE "FeedProvider" AS ENUM ('MERCADO_PAGO');

-- CreateEnum
CREATE TYPE "FeedStatus" AS ENUM ('NEEDS_ACCOUNT', 'ACTIVE', 'NEEDS_RECONNECT');

-- CreateEnum
CREATE TYPE "ExternalMovementKind" AS ENUM ('INCOME', 'EXPENSE', 'YIELD', 'RESERVE_IN', 'RESERVE_OUT', 'FX', 'REFUND');

-- CreateEnum
CREATE TYPE "ExternalMovementStatus" AS ENUM ('APPLIED', 'LINKED', 'HELD', 'DISMISSED');

-- AlterEnum
ALTER TYPE "Channel" ADD VALUE 'MERCADO_PAGO';

-- CreateTable
CREATE TABLE "FeedConnection" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "FeedProvider" NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "accountId" UUID,
    "status" "FeedStatus" NOT NULL,
    "accessTokenEnc" BYTEA,
    "refreshTokenEnc" BYTEA,
    "tokenExpiresAt" TIMESTAMP(3),
    "cursor" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEventAt" TIMESTAMP(3),

    CONSTRAINT "FeedConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedReserve" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "externalReserveId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "pocketId" UUID,

    CONSTRAINT "FeedReserve_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalMovement" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "kind" "ExternalMovementKind" NOT NULL,
    "status" "ExternalMovementStatus" NOT NULL,
    "holdReason" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "amountIn" DECIMAL(18,2),
    "currency" "Currency" NOT NULL,
    "currencyIn" "Currency",
    "date" DATE NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "externalReserveId" TEXT,
    "direction" TEXT,
    "refundOf" TEXT,
    "transactionId" UUID,
    "transferId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedDailyUsage" (
    "userId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "created" INTEGER NOT NULL DEFAULT 0,
    "overLimit" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FeedDailyUsage_pkey" PRIMARY KEY ("userId","day")
);

-- CreateTable
CREATE TABLE "FeedSkippedMovement" (
    "connectionId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedSkippedMovement_pkey" PRIMARY KEY ("connectionId","externalId")
);

-- CreateTable
CREATE TABLE "FeedWebhookEvent" (
    "requestId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedWebhookEvent_pkey" PRIMARY KEY ("requestId")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeedConnection_userId_provider_key" ON "FeedConnection"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "FeedConnection_provider_externalUserId_key" ON "FeedConnection"("provider", "externalUserId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedConnection_accountId_key" ON "FeedConnection"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedReserve_connectionId_externalReserveId_key" ON "FeedReserve"("connectionId", "externalReserveId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalMovement_transactionId_key" ON "ExternalMovement"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalMovement_transferId_key" ON "ExternalMovement"("transferId");

-- CreateIndex
CREATE INDEX "ExternalMovement_userId_status_idx" ON "ExternalMovement"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalMovement_connectionId_externalId_key" ON "ExternalMovement"("connectionId", "externalId");

-- CreateIndex
CREATE INDEX "FeedSkippedMovement_createdAt_idx" ON "FeedSkippedMovement"("createdAt");

-- AddForeignKey
ALTER TABLE "FeedConnection" ADD CONSTRAINT "FeedConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedConnection" ADD CONSTRAINT "FeedConnection_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedReserve" ADD CONSTRAINT "FeedReserve_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "FeedConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedReserve" ADD CONSTRAINT "FeedReserve_pocketId_fkey" FOREIGN KEY ("pocketId") REFERENCES "Pocket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalMovement" ADD CONSTRAINT "ExternalMovement_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "FeedConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalMovement" ADD CONSTRAINT "ExternalMovement_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalMovement" ADD CONSTRAINT "ExternalMovement_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A movement is created or linked from one place at most.
ALTER TABLE "ExternalMovement" ADD CONSTRAINT "ExternalMovement_one_target"
  CHECK ("transactionId" IS NULL OR "transferId" IS NULL);

-- MPG-08: deleting what came from an institution (or what it was linked to), by any path (the
-- app, the bot's /deshacer, a fixed item), leaves it DISMISSED so it never comes in again.
CREATE FUNCTION "dismiss_external_movement"() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'Transaction' THEN
    UPDATE "ExternalMovement" SET "status" = 'DISMISSED' WHERE "transactionId" = OLD."id";
  ELSE
    UPDATE "ExternalMovement" SET "status" = 'DISMISSED' WHERE "transferId" = OLD."id";
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Transaction_dismiss_external" BEFORE DELETE ON "Transaction"
  FOR EACH ROW EXECUTE FUNCTION "dismiss_external_movement"();
CREATE TRIGGER "Transfer_dismiss_external" BEFORE DELETE ON "Transfer"
  FOR EACH ROW EXECUTE FUNCTION "dismiss_external_movement"();

-- MPG-07: the new limit in the existing plans: one a day on Gratis, no limit on the rest.
UPDATE "Plan"
SET "limits" = "limits"::jsonb || jsonb_build_object(
  'maxFeedMovementsPerDay', CASE WHEN "key" = 'free' THEN to_jsonb(1) ELSE 'null'::jsonb END
);
