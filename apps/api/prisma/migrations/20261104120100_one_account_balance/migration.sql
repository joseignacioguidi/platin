-- One account balance (AVAILABLE pocket) per account and currency. The extra ones become spending
-- reserves; the oldest stays as the balance.
UPDATE "Pocket" p
SET "kind" = 'SPENDING'
FROM (
    SELECT "id", ROW_NUMBER() OVER (
        PARTITION BY "accountId", "currency" ORDER BY "createdAt", "id"
    ) AS n
    FROM "Pocket"
    WHERE "kind" = 'AVAILABLE'
) ranked
WHERE p."id" = ranked."id" AND ranked.n > 1;

-- CreateIndex (partial: Prisma can't express it in the schema)
CREATE UNIQUE INDEX "Pocket_account_balance_key" ON "Pocket" ("accountId", "currency") WHERE "kind" = 'AVAILABLE';
