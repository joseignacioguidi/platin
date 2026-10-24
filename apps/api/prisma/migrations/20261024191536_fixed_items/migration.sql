-- CreateEnum
CREATE TYPE "FixedKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateTable
CREATE TABLE "FixedItem" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "FixedKind" NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "accountId" UUID,
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

-- CreateIndex
CREATE INDEX "FixedItem_userId_idx" ON "FixedItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAmount_fixedId_effectiveFrom_key" ON "FixedAmount"("fixedId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fixedId_fkey" FOREIGN KEY ("fixedId") REFERENCES "FixedItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedItem" ADD CONSTRAINT "FixedItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedItem" ADD CONSTRAINT "FixedItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedItem" ADD CONSTRAINT "FixedItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedItem" ADD CONSTRAINT "FixedItem_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAmount" ADD CONSTRAINT "FixedAmount_fixedId_fkey" FOREIGN KEY ("fixedId") REFERENCES "FixedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A fixed item is charged to an account or to a card (exactly one), with a valid schedule.
ALTER TABLE "FixedItem" ADD CONSTRAINT "FixedItem_one_source_check"
  CHECK (("accountId" IS NOT NULL) <> ("cardId" IS NOT NULL));
ALTER TABLE "FixedItem" ADD CONSTRAINT "FixedItem_schedule_check"
  CHECK ("intervalMonths" >= 1 AND "dayOfMonth" BETWEEN 1 AND 31
         AND ("endPeriod" IS NULL OR "endPeriod" >= "startPeriod"));
ALTER TABLE "FixedAmount" ADD CONSTRAINT "FixedAmount_positive_check" CHECK ("amount" > 0);
