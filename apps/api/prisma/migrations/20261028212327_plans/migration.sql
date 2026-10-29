-- CreateEnum
CREATE TYPE "PlanSource" AS ENUM ('DEFAULT', 'ADMIN', 'REQUEST', 'PAYMENT');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Plan" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceArs" DECIMAL(18,2),
    "limits" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPlan" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "source" "PlanSource" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "grantedBy" UUID,

    CONSTRAINT "UserPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "message" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedBy" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_key_key" ON "Plan"("key");

-- CreateIndex
CREATE INDEX "UserPlan_userId_startsAt_idx" ON "UserPlan"("userId", "startsAt");

-- CreateIndex
CREATE INDEX "PlanRequest_status_createdAt_idx" ON "PlanRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PlanRequest_userId_idx" ON "PlanRequest"("userId");

-- AddForeignKey
ALTER TABLE "UserPlan" ADD CONSTRAINT "UserPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanRequest" ADD CONSTRAINT "PlanRequest_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exactly one default plan.
CREATE UNIQUE INDEX "Plan_isDefault_key" ON "Plan"("isDefault") WHERE "isDefault" = true;

-- Initial plans (see docs/adr/0015-planes.md). The admin edits them from the panel.
INSERT INTO "Plan" ("id", "key", "name", "description", "limits", "isDefault", "isPublic", "sortOrder")
VALUES
  (gen_random_uuid(), 'free', 'Gratis', 'Lo justo para ordenar tu plata del día a día.',
   '{"maxAccounts": 3, "maxPockets": 5, "maxCards": 2, "maxGoals": 3, "maxFixed": 15, "investments": false}',
   true, true, 0),
  (gen_random_uuid(), 'pro', 'Pro', 'Sin límites, con inversiones.',
   '{"maxAccounts": null, "maxPockets": null, "maxCards": null, "maxGoals": null, "maxFixed": null, "investments": true}',
   false, true, 1);
