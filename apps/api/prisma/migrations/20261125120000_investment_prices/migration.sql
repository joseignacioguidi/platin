-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('DATA912', 'ARGENTINADATOS', 'COINGECKO');

-- CreateEnum
CREATE TYPE "ValuationSource" AS ENUM ('MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "HoldingDirection" AS ENUM ('IN', 'OUT');

-- AlterTable
ALTER TABLE "PocketValuation" ADD COLUMN     "source" "ValuationSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "units" DECIMAL(24,8);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" UUID NOT NULL,
    "source" "PriceSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "InstrumentType" NOT NULL,
    "currency" "Currency" NOT NULL,
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstrumentPrice" (
    "instrumentId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "price" DECIMAL(18,6) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstrumentPrice_pkey" PRIMARY KEY ("instrumentId","date")
);

-- CreateTable
CREATE TABLE "PocketHolding" (
    "pocketId" UUID NOT NULL,
    "instrumentId" UUID NOT NULL,
    "initialUnits" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PocketHolding_pkey" PRIMARY KEY ("pocketId")
);

-- CreateTable
CREATE TABLE "HoldingAdjustment" (
    "id" UUID NOT NULL,
    "pocketId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "units" DECIMAL(24,8) NOT NULL,
    "direction" "HoldingDirection" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HoldingAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermDeposit" (
    "pocketId" UUID NOT NULL,
    "principal" DECIMAL(18,2) NOT NULL,
    "tna" DECIMAL(9,6) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,

    CONSTRAINT "TermDeposit_pkey" PRIMARY KEY ("pocketId")
);

-- CreateIndex
CREATE INDEX "Instrument_type_active_idx" ON "Instrument"("type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_source_externalId_key" ON "Instrument"("source", "externalId");

-- CreateIndex
CREATE INDEX "PocketHolding_instrumentId_idx" ON "PocketHolding"("instrumentId");

-- CreateIndex
CREATE INDEX "HoldingAdjustment_pocketId_date_idx" ON "HoldingAdjustment"("pocketId", "date");

-- AddForeignKey
ALTER TABLE "InstrumentPrice" ADD CONSTRAINT "InstrumentPrice_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PocketHolding" ADD CONSTRAINT "PocketHolding_pocketId_fkey" FOREIGN KEY ("pocketId") REFERENCES "Pocket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PocketHolding" ADD CONSTRAINT "PocketHolding_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldingAdjustment" ADD CONSTRAINT "HoldingAdjustment_pocketId_fkey" FOREIGN KEY ("pocketId") REFERENCES "Pocket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermDeposit" ADD CONSTRAINT "TermDeposit_pocketId_fkey" FOREIGN KEY ("pocketId") REFERENCES "Pocket"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Amounts and units are positive; the direction gives the sign (as with money).
ALTER TABLE "HoldingAdjustment" ADD CONSTRAINT "HoldingAdjustment_units_positive" CHECK ("units" > 0);
ALTER TABLE "PocketHolding" ADD CONSTRAINT "PocketHolding_initialUnits_non_negative" CHECK ("initialUnits" >= 0);
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_units_positive" CHECK ("units" IS NULL OR "units" > 0);
ALTER TABLE "InstrumentPrice" ADD CONSTRAINT "InstrumentPrice_price_positive" CHECK ("price" > 0);
ALTER TABLE "TermDeposit" ADD CONSTRAINT "TermDeposit_terms_valid" CHECK ("principal" > 0 AND "tna" >= 0 AND "endDate" > "startDate");
