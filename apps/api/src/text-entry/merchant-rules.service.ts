import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  ChannelValue,
  CreateMerchantRuleRequest,
  MerchantRule,
  UpdateMerchantRuleRequest,
} from '@platin/contracts';
import { normalizePattern } from '@platin/domain';
import { AppException } from '../common/app-exception';
import { Prisma, type MerchantRule as MerchantRuleRow } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export function toMerchantRuleDto(row: MerchantRuleRow): MerchantRule {
  return {
    id: row.id,
    pattern: row.pattern,
    categoryId: row.categoryId,
    createdVia: row.createdVia,
    createdAt: row.createdAt.toISOString(),
  };
}

/** TXT-03: the user's merchant rules ("coto" → Supermercado). */
@Injectable()
export class MerchantRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<MerchantRule[]> {
    const rows = await this.prisma.merchantRule.findMany({
      where: { userId },
      orderBy: { pattern: 'asc' },
    });
    return rows.map(toMerchantRuleDto);
  }

  async create(
    userId: string,
    request: CreateMerchantRuleRequest,
    via: ChannelValue = 'APP',
  ): Promise<MerchantRule> {
    await this.assertCategory(userId, request.categoryId);
    try {
      const row = await this.prisma.merchantRule.create({
        data: {
          userId,
          pattern: normalizePattern(request.pattern),
          categoryId: request.categoryId,
          createdVia: via,
        },
      });
      return toMerchantRuleDto(row);
    } catch (error) {
      throw this.duplicate(error);
    }
  }

  /** From the bot (BOT-03): creates the rule or points the existing one to the new category. */
  async upsert(userId: string, pattern: string, categoryId: string, via: ChannelValue) {
    await this.assertCategory(userId, categoryId);
    const normalized = normalizePattern(pattern);
    const row = await this.prisma.merchantRule.upsert({
      where: { userId_pattern: { userId, pattern: normalized } },
      create: { userId, pattern: normalized, categoryId, createdVia: via },
      update: { categoryId },
    });
    return toMerchantRuleDto(row);
  }

  async update(
    userId: string,
    id: string,
    changes: UpdateMerchantRuleRequest,
  ): Promise<MerchantRule> {
    await this.getOwned(userId, id);
    if (changes.categoryId) await this.assertCategory(userId, changes.categoryId);
    try {
      const row = await this.prisma.merchantRule.update({
        where: { id },
        data: {
          ...(changes.pattern === undefined ? {} : { pattern: normalizePattern(changes.pattern) }),
          ...(changes.categoryId === undefined ? {} : { categoryId: changes.categoryId }),
        },
      });
      return toMerchantRuleDto(row);
    } catch (error) {
      throw this.duplicate(error);
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getOwned(userId, id);
    await this.prisma.merchantRule.delete({ where: { id } });
  }

  private async getOwned(userId: string, id: string): Promise<MerchantRuleRow> {
    const row = await this.prisma.merchantRule.findFirst({ where: { id, userId } });
    if (!row) throw AppException.notFound('Rule not found');
    return row;
  }

  /** A category of the user that can be chosen: active and not a system one. */
  private async assertCategory(userId: string, categoryId: string): Promise<void> {
    const category = await this.prisma.category.findFirst({ where: { id: categoryId, userId } });
    if (!category) throw AppException.notFound('Category not found');
    if (category.systemKey) {
      throw new AppException(
        'CATEGORY_SYSTEM',
        HttpStatus.CONFLICT,
        'System categories cannot have rules',
      );
    }
    if (category.archivedAt) {
      throw new AppException(
        'CATEGORY_ARCHIVED',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The category is archived',
      );
    }
  }

  private duplicate(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new AppException(
        'RULE_EXISTS',
        HttpStatus.CONFLICT,
        'There is already a rule with that pattern',
        [{ path: 'pattern', message: 'Ya tenés una regla con ese texto' }],
      );
    }
    return error;
  }
}
