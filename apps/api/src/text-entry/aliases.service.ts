import { HttpStatus, Injectable } from '@nestjs/common';
import type { AliasesResponse } from '@platin/contracts';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';

type Target = { accountId: string } | { cardId: string };

/** TXT-02: "Nombres para escribir" of accounts and cards; unique per user. */
@Injectable()
export class AliasesService {
  constructor(private readonly prisma: PrismaService) {}

  async putForAccount(userId: string, accountId: string, aliases: string[]): Promise<AliasesResponse> {
    const account = await this.prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) throw AppException.notFound('Account not found');
    return this.replace(userId, { accountId }, aliases);
  }

  async putForCard(userId: string, cardId: string, aliases: string[]): Promise<AliasesResponse> {
    const card = await this.prisma.creditCard.findFirst({ where: { id: cardId, userId } });
    if (!card) throw AppException.notFound('Card not found');
    return this.replace(userId, { cardId }, aliases);
  }

  /** Replaces every alias of the target in one transaction; ALIAS_TAKEN if another one has it. */
  private async replace(userId: string, target: Target, aliases: string[]): Promise<AliasesResponse> {
    await this.prisma.$transaction(async (tx) => {
      if (aliases.length > 0) {
        const existing = await tx.sourceAlias.findMany({
          where: { userId, alias: { in: aliases } },
        });
        const taken = existing.find((row) =>
          'accountId' in target ? row.accountId !== target.accountId : row.cardId !== target.cardId,
        );
        if (taken) {
          throw new AppException(
            'ALIAS_TAKEN',
            HttpStatus.CONFLICT,
            `"${taken.alias}" already names another account or card`,
            [{ path: 'aliases', message: `"${taken.alias}" ya lo usa otra cuenta o tarjeta` }],
          );
        }
      }
      await tx.sourceAlias.deleteMany({ where: { userId, ...target } });
      if (aliases.length > 0) {
        await tx.sourceAlias.createMany({
          data: aliases.map((alias) => ({ userId, alias, ...target })),
        });
      }
    });
    return { aliases: [...aliases].sort() };
  }
}
