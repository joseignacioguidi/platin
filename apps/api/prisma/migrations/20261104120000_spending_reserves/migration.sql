-- AlterEnum: a reserve to spend from (iteration 6). Its own migration: a new enum value can't be
-- used in the same transaction that adds it.
ALTER TYPE "PocketKind" ADD VALUE 'SPENDING' AFTER 'AVAILABLE';
