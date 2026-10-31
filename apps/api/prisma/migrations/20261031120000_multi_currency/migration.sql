-- Iteration 4: more currencies (MON-01 to 05).

-- AlterEnum: new values are only added here; nothing below uses them in this transaction.
ALTER TYPE "Currency" ADD VALUE 'EUR';
ALTER TYPE "Currency" ADD VALUE 'BRL';
ALTER TYPE "Currency" ADD VALUE 'CLP';
ALTER TYPE "Currency" ADD VALUE 'UYU';

-- Enabled currencies per user; existing users keep pesos and dollars.
ALTER TABLE "User" ADD COLUMN "currencies" "Currency"[] DEFAULT ARRAY['ARS', 'USD']::"Currency"[];

-- Rates are per currency: the stored rows were dollar rates.
DROP INDEX "ExchangeRate_date_type_key";
ALTER TABLE "ExchangeRate" ADD COLUMN "currency" "Currency" NOT NULL DEFAULT 'USD';
CREATE UNIQUE INDEX "ExchangeRate_date_currency_type_key" ON "ExchangeRate"("date", "currency", "type");

-- ---------- Checks the Prisma schema can't express ----------

-- MON-05: cards stay in pesos and dollars.
ALTER TABLE "CardCharge" ADD CONSTRAINT "CardCharge_currency_check"
  CHECK ("currency" IN ('ARS', 'USD'));
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_currency_check"
  CHECK ("currency" IN ('ARS', 'USD'));
ALTER TABLE "StatementAdjustment" ADD CONSTRAINT "StatementAdjustment_currency_check"
  CHECK ("currency" IN ('ARS', 'USD'));
ALTER TABLE "FixedItem" ADD CONSTRAINT "FixedItem_card_currency_check"
  CHECK ("cardId" IS NULL OR "currency" IN ('ARS', 'USD'));

-- The base currency is pesos or dollars.
ALTER TABLE "User" ADD CONSTRAINT "User_base_currency_check"
  CHECK ("baseCurrency" IN ('ARS', 'USD'));
