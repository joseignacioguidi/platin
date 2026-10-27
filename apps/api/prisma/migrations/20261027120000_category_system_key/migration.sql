-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "systemKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_systemKey_key" ON "Category"("userId", "systemKey");

-- System categories (CAT-05) for the users that already exist. If a user already has a
-- category with the same name and kind, that one becomes the system category.
INSERT INTO "Category" ("id", "userId", "name", "kind", "icon", "color", "systemKey")
SELECT gen_random_uuid(), u."id", s."name", s."kind"::"CategoryKind", s."icon", s."color", s."systemKey"
FROM "User" u
CROSS JOIN (VALUES
  ('Ajustes', 'EXPENSE', 'scale', 'muted', 'ADJUSTMENT'),
  ('Rendimientos', 'INCOME', 'trending-up', 'savings', 'YIELD')
) AS s("name", "kind", "icon", "color", "systemKey")
ON CONFLICT ("userId", "kind", "name") DO UPDATE SET "systemKey" = EXCLUDED."systemKey", "archivedAt" = NULL;
