-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('ARS', 'USD');

-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('OFICIAL', 'MEP', 'BLUE');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('BANK', 'WALLET', 'CASH', 'BROKER');

-- CreateEnum
CREATE TYPE "PocketKind" AS ENUM ('AVAILABLE', 'SAVINGS', 'INVESTMENT');

-- CreateEnum
CREATE TYPE "InstrumentType" AS ENUM ('CEDEAR', 'STOCK', 'MUTUAL_FUND', 'TERM_DEPOSIT', 'CRYPTO', 'OTHER');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('INCOME', 'EXPENSE', 'ADJUSTMENT', 'YIELD');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "TxOrigin" AS ENUM ('MANUAL', 'FIXED', 'ADJUSTMENT', 'VALUATION');

-- CreateEnum
CREATE TYPE "FixedKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StatementStatus" AS ENUM ('OPEN', 'CLOSED', 'PARTIALLY_PAID', 'PAID');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "baseCurrency" "Currency" NOT NULL DEFAULT 'ARS',
    "valuationRate" "RateType" NOT NULL DEFAULT 'MEP',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "family" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pocket" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PocketKind" NOT NULL,
    "currency" "Currency" NOT NULL,
    "instrument" "InstrumentType",
    "initialBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "includeInNetWorth" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pocket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PocketValuation" (
    "id" UUID NOT NULL,
    "pocketId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "transactionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PocketValuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "parentId" UUID,
    "systemKey" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "pocketId" UUID NOT NULL,
    "categoryId" UUID,
    "type" "TxType" NOT NULL,
    "status" "TxStatus" NOT NULL DEFAULT 'CONFIRMED',
    "origin" "TxOrigin" NOT NULL DEFAULT 'MANUAL',
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "rateToBase" DECIMAL(18,6) NOT NULL,
    "baseAmount" DECIMAL(18,2) NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT,
    "fixedId" UUID,
    "fixedPeriod" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fromPocketId" UUID NOT NULL,
    "toPocketId" UUID,
    "statementId" UUID,
    "amountOut" DECIMAL(18,2) NOT NULL,
    "amountIn" DECIMAL(18,2) NOT NULL,
    "currencyIn" "Currency" NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCard" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "last4" CHAR(4),
    "creditLimit" DECIMAL(18,2),
    "closingDay" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "defaultPaymentPocketId" UUID,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardStatement" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "period" DATE NOT NULL,
    "closingDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "datesOverridden" BOOLEAN NOT NULL DEFAULT false,
    "status" "StatementStatus" NOT NULL DEFAULT 'OPEN',
    "bankTotalArs" DECIMAL(18,2),
    "bankTotalUsd" DECIMAL(18,2),

    CONSTRAINT "CardStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardCharge" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "installmentsCount" INTEGER NOT NULL DEFAULT 1,
    "startInstallment" INTEGER NOT NULL DEFAULT 1,
    "fixedId" UUID,
    "fixedPeriod" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installment" (
    "id" UUID NOT NULL,
    "chargeId" UUID NOT NULL,
    "statementId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,

    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementAdjustment" (
    "id" UUID NOT NULL,
    "statementId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "description" TEXT,

    CONSTRAINT "StatementAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedItem" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "FixedKind" NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "pocketId" UUID,
    "cardId" UUID,
    "currency" "Currency" NOT NULL,
    "intervalMonths" INTEGER NOT NULL DEFAULT 1,
    "dayOfMonth" INTEGER NOT NULL,
    "startPeriod" DATE NOT NULL,
    "endPeriod" DATE,
    "pausedAt" TIMESTAMP(3),
    "lastGeneratedPeriod" DATE,

    CONSTRAINT "FixedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAmount" (
    "id" UUID NOT NULL,
    "fixedId" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,

    CONSTRAINT "FixedAmount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "RateType" NOT NULL,
    "buy" DECIMAL(18,6) NOT NULL,
    "sell" DECIMAL(18,6) NOT NULL,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "targetPeriod" DATE NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalPocket" (
    "goalId" UUID NOT NULL,
    "pocketId" UUID NOT NULL,

    CONSTRAINT "GoalPocket_pkey" PRIMARY KEY ("goalId","pocketId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_family_idx" ON "RefreshToken"("family");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_name_key" ON "Account"("userId", "name");

-- CreateIndex
CREATE INDEX "Pocket_userId_idx" ON "Pocket"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Pocket_accountId_name_currency_key" ON "Pocket"("accountId", "name", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "PocketValuation_transactionId_key" ON "PocketValuation"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PocketValuation_pocketId_date_key" ON "PocketValuation"("pocketId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_kind_name_key" ON "Category"("userId", "kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_systemKey_key" ON "Category"("userId", "systemKey");

-- CreateIndex
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");

-- CreateIndex
CREATE INDEX "Transaction_pocketId_date_idx" ON "Transaction"("pocketId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_fixedId_fixedPeriod_key" ON "Transaction"("fixedId", "fixedPeriod");

-- CreateIndex
CREATE INDEX "Transfer_userId_date_idx" ON "Transfer"("userId", "date");

-- CreateIndex
CREATE INDEX "Transfer_fromPocketId_idx" ON "Transfer"("fromPocketId");

-- CreateIndex
CREATE INDEX "Transfer_toPocketId_idx" ON "Transfer"("toPocketId");

-- CreateIndex
CREATE INDEX "CreditCard_userId_idx" ON "CreditCard"("userId");

-- CreateIndex
CREATE INDEX "CardStatement_userId_dueDate_idx" ON "CardStatement"("userId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "CardStatement_cardId_period_key" ON "CardStatement"("cardId", "period");

-- CreateIndex
CREATE INDEX "CardCharge_userId_date_idx" ON "CardCharge"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CardCharge_fixedId_fixedPeriod_key" ON "CardCharge"("fixedId", "fixedPeriod");

-- CreateIndex
CREATE INDEX "Installment_statementId_idx" ON "Installment"("statementId");

-- CreateIndex
CREATE UNIQUE INDEX "Installment_chargeId_number_key" ON "Installment"("chargeId", "number");

-- CreateIndex
CREATE INDEX "FixedItem_userId_idx" ON "FixedItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAmount_fixedId_effectiveFrom_key" ON "FixedAmount"("fixedId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_date_type_key" ON "ExchangeRate"("date", "type");

-- CreateIndex
CREATE INDEX "Goal_userId_idx" ON "Goal"("userId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pocket" ADD CONSTRAINT "Pocket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pocket" ADD CONSTRAINT "Pocket_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PocketValuation" ADD CONSTRAINT "PocketValuation_pocketId_fkey" FOREIGN KEY ("pocketId") REFERENCES "Pocket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PocketValuation" ADD CONSTRAINT "PocketValuation_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_pocketId_fkey" FOREIGN KEY ("pocketId") REFERENCES "Pocket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fixedId_fkey" FOREIGN KEY ("fixedId") REFERENCES "FixedItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromPocketId_fkey" FOREIGN KEY ("fromPocketId") REFERENCES "Pocket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toPocketId_fkey" FOREIGN KEY ("toPocketId") REFERENCES "Pocket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "CardStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_defaultPaymentPocketId_fkey" FOREIGN KEY ("defaultPaymentPocketId") REFERENCES "Pocket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardStatement" ADD CONSTRAINT "CardStatement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardStatement" ADD CONSTRAINT "CardStatement_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardCharge" ADD CONSTRAINT "CardCharge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardCharge" ADD CONSTRAINT "CardCharge_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardCharge" ADD CONSTRAINT "CardCharge_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "CardCharge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "CardStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementAdjustment" ADD CONSTRAINT "StatementAdjustment_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "CardStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementAdjustment" ADD CONSTRAINT "StatementAdjustment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedItem" ADD CONSTRAINT "FixedItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedItem" ADD CONSTRAINT "FixedItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedItem" ADD CONSTRAINT "FixedItem_pocketId_fkey" FOREIGN KEY ("pocketId") REFERENCES "Pocket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedItem" ADD CONSTRAINT "FixedItem_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAmount" ADD CONSTRAINT "FixedAmount_fixedId_fkey" FOREIGN KEY ("fixedId") REFERENCES "FixedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalPocket" ADD CONSTRAINT "GoalPocket_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalPocket" ADD CONSTRAINT "GoalPocket_pocketId_fkey" FOREIGN KEY ("pocketId") REFERENCES "Pocket"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------- Checks the Prisma schema can't express ----------

-- Amounts are positive; only adjustments and yields carry a sign (ADR 0004).
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_amount_sign_check"
  CHECK ("type" IN ('ADJUSTMENT', 'YIELD') OR "amount" > 0);

-- A transfer goes to exactly one destination: a pocket or a card statement.
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_one_destination_check"
  CHECK (("toPocketId" IS NOT NULL) <> ("statementId" IS NOT NULL));
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_positive_amounts_check"
  CHECK ("amountOut" > 0 AND "amountIn" > 0);
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_different_pockets_check"
  CHECK ("toPocketId" IS NULL OR "toPocketId" <> "fromPocketId");

-- Only investment pockets have an instrument.
ALTER TABLE "Pocket" ADD CONSTRAINT "Pocket_instrument_check"
  CHECK (("kind" = 'INVESTMENT') OR ("instrument" IS NULL));

-- Card days and installment plans must make sense.
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_days_check"
  CHECK ("closingDay" BETWEEN 1 AND 31 AND "dueDay" BETWEEN 1 AND 31);
ALTER TABLE "CardCharge" ADD CONSTRAINT "CardCharge_plan_check"
  CHECK ("totalAmount" > 0 AND "installmentsCount" >= 1
         AND "startInstallment" BETWEEN 1 AND "installmentsCount");
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_amount_check" CHECK ("amount" > 0);

-- A fixed item is charged to a pocket or to a card (exactly one), with a valid schedule.
ALTER TABLE "FixedItem" ADD CONSTRAINT "FixedItem_one_source_check"
  CHECK (("pocketId" IS NOT NULL) <> ("cardId" IS NOT NULL));
ALTER TABLE "FixedItem" ADD CONSTRAINT "FixedItem_schedule_check"
  CHECK ("intervalMonths" >= 1 AND "dayOfMonth" BETWEEN 1 AND 31
         AND ("endPeriod" IS NULL OR "endPeriod" >= "startPeriod"));
ALTER TABLE "FixedAmount" ADD CONSTRAINT "FixedAmount_positive_check" CHECK ("amount" > 0);
