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

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_date_type_key" ON "ExchangeRate"("date", "type");
