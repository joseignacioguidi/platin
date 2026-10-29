import { HttpStatus, Injectable } from '@nestjs/common';
import type { AdminUser, AdminUserDetail, AdminUsersPage, UserStatus } from '@platin/contracts';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import { ClockService } from '../common/clock.service';
import { afterCreatedAtCursor, toPage } from '../common/created-at-cursor';
import type { Prisma } from '../generated/prisma/client';
import { CurrentPlan, PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';

/** Account data only: the admin never reads a user's financial records, just counts them. */
const ACCOUNT_FIELDS = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  createdAt: true,
  lastSeenAt: true,
} as const;

type AccountRow = Prisma.UserGetPayload<{ select: typeof ACCOUNT_FIELDS }>;

export interface AdminUsersFilter {
  query?: string;
  status?: UserStatus;
  role?: 'USER' | 'ADMIN';
  planId?: string;
  cursor?: string;
  limit: number;
}

/** ADM-03 and ADM-04. */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
    private readonly plans: PlansService,
  ) {}

  async list(filter: AdminUsersFilter): Promise<AdminUsersPage> {
    // The plan in force is resolved from the history, so the plan filter goes through it.
    const planUserIds = filter.planId ? await this.usersWithPlan(filter.planId) : undefined;
    const rows = await this.prisma.user.findMany({
      where: {
        AND: [
          filter.query
            ? {
                OR: [
                  { email: { contains: filter.query, mode: 'insensitive' } },
                  { name: { contains: filter.query, mode: 'insensitive' } },
                ],
              }
            : {},
          filter.status ? { status: filter.status } : {},
          filter.role ? { role: filter.role } : {},
          planUserIds ? { id: { in: planUserIds } } : {},
          afterCreatedAtCursor(filter.cursor),
        ],
      },
      select: ACCOUNT_FIELDS,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filter.limit + 1,
    });
    const page = toPage(rows, filter.limit);
    const plans = await this.plans.currentFor(page.rows.map((row) => row.id));
    return {
      items: page.rows.map((row) => toAdminUser(row, plans.get(row.id) as CurrentPlan)),
      nextCursor: page.nextCursor,
    };
  }

  async detail(id: string): Promise<AdminUserDetail> {
    const user = await this.find(id);
    const where = { userId: id };
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
      activeSessions,
    ] = await this.prisma.$transaction([
      this.prisma.account.count({ where }),
      this.prisma.pocket.count({ where }),
      this.prisma.category.count({ where }),
      this.prisma.transaction.count({ where }),
      this.prisma.transfer.count({ where }),
      this.prisma.creditCard.count({ where }),
      this.prisma.cardCharge.count({ where }),
      this.prisma.fixedItem.count({ where }),
      this.prisma.goal.count({ where }),
      this.prisma.refreshToken.count({
        where: { userId: id, revokedAt: null, expiresAt: { gt: this.clock.now() } },
      }),
    ]);
    return {
      ...toAdminUser(user, await this.plans.current(id)),
      activeSessions,
      counts: {
        accounts,
        pockets,
        categories,
        transactions,
        transfers,
        cards,
        cardCharges,
        fixed,
        goals,
      },
    };
  }

  /** Suspending also closes every session; the data is kept. */
  async setStatus(actorId: string, id: string, status: UserStatus): Promise<AdminUserDetail> {
    if (status === 'SUSPENDED') this.assertNotSelf(actorId, id, 'suspend');
    const user = await this.find(id);
    if (user.status !== status) {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id }, data: { status } });
        if (status === 'SUSPENDED') await this.revokeSessions(tx, id);
        await this.audit.record(tx, {
          actorId,
          action: status === 'SUSPENDED' ? 'user.suspend' : 'user.reactivate',
          targetUserId: id,
          payload: { before: { status: user.status }, after: { status } },
        });
      });
    }
    return this.detail(id);
  }

  async logout(actorId: string, id: string): Promise<AdminUserDetail> {
    await this.find(id);
    await this.prisma.$transaction(async (tx) => {
      const revoked = await this.revokeSessions(tx, id);
      await this.audit.record(tx, {
        actorId,
        action: 'user.logout',
        targetUserId: id,
        payload: { revokedSessions: revoked },
      });
    });
    return this.detail(id);
  }

  /** Deletes the account and every record it owns. Needs the user's email as confirmation. */
  async delete(actorId: string, id: string, confirmEmail: string): Promise<void> {
    this.assertNotSelf(actorId, id, 'delete');
    const user = await this.find(id);
    if (user.email.toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      throw new AppException(
        'CONFIRMATION_MISMATCH',
        HttpStatus.BAD_REQUEST,
        'The email does not match the user',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await deleteUserData(tx, id);
      await this.audit.record(tx, {
        actorId,
        action: 'user.delete',
        targetUserId: id,
        payload: { email: user.email, createdAt: user.createdAt.toISOString() },
      });
    });
  }

  private async find(id: string): Promise<AccountRow> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: ACCOUNT_FIELDS });
    if (!user) throw AppException.notFound('User not found');
    return user;
  }

  private async usersWithPlan(planId: string): Promise<string[]> {
    const ids = (await this.prisma.user.findMany({ select: { id: true } })).map((user) => user.id);
    const current = await this.plans.currentFor(ids);
    return ids.filter((id) => current.get(id)?.plan.id === planId);
  }

  private assertNotSelf(actorId: string, id: string, action: string): void {
    if (actorId === id) {
      throw new AppException(
        'ADMIN_SELF_ACTION',
        HttpStatus.CONFLICT,
        `An administrator cannot ${action} their own account`,
      );
    }
  }

  private async revokeSessions(tx: Prisma.TransactionClient, userId: string): Promise<number> {
    const { count } = await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
    return count;
  }
}

function toAdminUser(user: AccountRow, current: CurrentPlan): AdminUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    plan: {
      id: current.plan.id,
      name: current.plan.name,
      source: current.assignment?.source ?? 'DEFAULT',
      endsAt: current.assignment?.endsAt?.toISOString() ?? null,
    },
  };
}

/**
 * Every row a user owns, children first: the financial relations are `Restrict` so nothing is
 * ever deleted by accident. Runs inside the caller's transaction.
 */
export async function deleteUserData(tx: Prisma.TransactionClient, userId: string): Promise<void> {
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
  await tx.category.deleteMany({ where: { userId, parentId: { not: null } } });
  await tx.category.deleteMany({ where });
  await tx.refreshToken.deleteMany({ where });
  await tx.activityDay.deleteMany({ where });
  await tx.userPlan.deleteMany({ where });
  await tx.planRequest.deleteMany({ where });
  await tx.user.delete({ where: { id: userId } });
}
