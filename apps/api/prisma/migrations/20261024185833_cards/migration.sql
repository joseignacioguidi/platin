-- CreateEnum
CREATE TYPE "StatementStatus" AS ENUM ('OPEN', 'CLOSED', 'PARTIALLY_PAID', 'PAID');

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
    "defaultPaymentAccountId" UUID,
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

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "CardStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_defaultPaymentAccountId_fkey" FOREIGN KEY ("defaultPaymentAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- Card days and installment plans must make sense.
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_days_check"
  CHECK ("closingDay" BETWEEN 1 AND 31 AND "dueDay" BETWEEN 1 AND 31);
ALTER TABLE "CardCharge" ADD CONSTRAINT "CardCharge_plan_check"
  CHECK ("totalAmount" > 0 AND "installmentsCount" >= 1
         AND "startInstallment" BETWEEN 1 AND "installmentsCount");
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_amount_check" CHECK ("amount" > 0);
