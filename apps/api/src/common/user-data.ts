import type { DataSummary } from '@platin/contracts';
import type { Prisma } from '../generated/prisma/client';

/** How many records of each type a user has; never their content (ADM-03, AUTH-09). */
export async function countUserData(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<DataSummary> {
  const where = { userId };
  const [
    accounts,
    pockets,
    categories,
    transactions,
    transfers,
    cards,
    cardCharges,
    fixed,
    goals,
    valuations,
  ] = await Promise.all([
    tx.account.count({ where }),
    tx.pocket.count({ where }),
    tx.category.count({ where }),
    tx.transaction.count({ where }),
    tx.transfer.count({ where }),
    tx.creditCard.count({ where }),
    tx.cardCharge.count({ where }),
    tx.fixedItem.count({ where }),
    tx.goal.count({ where }),
    tx.pocketValuation.count({ where: { pocket: { userId } } }),
  ]);
  return {
    accounts,
    pockets,
    categories,
    transactions,
    transfers,
    cards,
    cardCharges,
    fixed,
    goals,
    valuations,
  };
}

/**
 * Every financial row a user owns, children first: the relations are `Restrict` so nothing is
 * ever deleted by accident. With `keepCategories` the categories stay untouched. Runs inside the
 * caller's transaction.
 */
export async function deleteFinancialData(
  tx: Prisma.TransactionClient,
  userId: string,
  options: { keepCategories: boolean },
): Promise<void> {
  const where = { userId };
  await tx.pocketValuation.deleteMany({ where: { pocket: { userId } } });
  await tx.goal.deleteMany({ where });
  await tx.transfer.deleteMany({ where });
  await tx.transaction.deleteMany({ where });
  await tx.fixedItem.deleteMany({ where });
  await tx.cardCharge.deleteMany({ where });
  await tx.cardStatement.deleteMany({ where });
  await tx.creditCard.deleteMany({ where });
  await tx.pocket.deleteMany({ where });
  await tx.account.deleteMany({ where });
  if (!options.keepCategories) {
    await tx.category.deleteMany({ where: { userId, parentId: { not: null } } });
    await tx.category.deleteMany({ where });
  }
}

/** The financial data plus the account itself: sessions, identities, activity, plan and requests. */
export async function deleteUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const where = { userId };
  await deleteFinancialData(tx, userId, { keepCategories: false });
  await tx.refreshToken.deleteMany({ where });
  await tx.authIdentity.deleteMany({ where });
  await tx.activityDay.deleteMany({ where });
  await tx.userPlan.deleteMany({ where });
  await tx.planRequest.deleteMany({ where });
  await tx.user.delete({ where: { id: userId } });
}
