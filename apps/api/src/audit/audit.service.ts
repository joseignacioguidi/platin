import { Injectable } from '@nestjs/common';
import type { AuditEntry, AuditPage } from '@platin/contracts';
import { afterCreatedAtCursor, toPage } from '../common/created-at-cursor';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditRecord {
  actorId: string;
  action: string;
  targetUserId?: string | null;
  /** Before and after of the change. Never financial data. */
  payload: Record<string, unknown>;
}

/** ADM-07: what each admin did, written in the same transaction as the change. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(tx: Prisma.TransactionClient, entry: AuditRecord): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        targetUserId: entry.targetUserId ?? null,
        payload: entry.payload as Prisma.InputJsonObject,
      },
    });
  }

  async list(query: { targetUserId?: string; cursor?: string; limit: number }): Promise<AuditPage> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(query.targetUserId ? { targetUserId: query.targetUserId } : {}),
        ...afterCreatedAtCursor(query.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = toPage(rows, query.limit);
    const ids = new Set<string>();
    for (const row of page.rows) {
      ids.add(row.actorId);
      if (row.targetUserId) ids.add(row.targetUserId);
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, email: true },
    });
    const emails = new Map(users.map((user) => [user.id, user.email]));
    const items: AuditEntry[] = page.rows.map((row) => {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      // A deleted user keeps their email in the payload of the deletion entry.
      const payloadEmail = typeof payload['email'] === 'string' ? payload['email'] : null;
      return {
        id: row.id,
        actorId: row.actorId,
        actorEmail: emails.get(row.actorId) ?? null,
        action: row.action,
        targetUserId: row.targetUserId,
        targetEmail: row.targetUserId ? (emails.get(row.targetUserId) ?? payloadEmail) : null,
        payload,
        createdAt: row.createdAt.toISOString(),
      };
    });
    return { items, nextCursor: page.nextCursor };
  }
}
