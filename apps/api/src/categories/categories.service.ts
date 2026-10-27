import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  Category,
  CategorySystemKey,
  ColorToken,
  CreateCategoryRequest,
  MergeCategoryResponse,
  UpdateCategoryRequest,
} from '@platin/contracts';
import type { CategoryKind } from '@platin/domain';
import { AppException } from '../common/app-exception';
import { Prisma, type Category as CategoryRow } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export function toCategoryDto(row: CategoryRow, usageCount?: number): Category {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    icon: row.icon,
    color: row.color as ColorToken,
    parentId: row.parentId,
    systemKey: row.systemKey as CategorySystemKey | null,
    archived: row.archivedAt !== null,
    ...(usageCount === undefined ? {} : { usageCount }),
  };
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, includeArchived = false, withUsage = false): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({
      where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    if (!withUsage) return rows.map((row) => toCategoryDto(row));
    const usage = await this.usage(userId);
    return rows.map((row) => toCategoryDto(row, usage.get(row.id) ?? 0));
  }

  async create(userId: string, request: CreateCategoryRequest): Promise<Category> {
    if (request.parentId) await this.assertParent(userId, request.parentId, request.kind);
    try {
      const row = await this.prisma.category.create({
        data: {
          userId,
          name: request.name,
          kind: request.kind,
          icon: request.icon,
          color: request.color,
          parentId: request.parentId ?? null,
        },
      });
      return toCategoryDto(row);
    } catch (error) {
      throw this.duplicate(error);
    }
  }

  async update(userId: string, id: string, changes: UpdateCategoryRequest): Promise<Category> {
    const current = await this.getOwned(userId, id);
    this.assertNotSystem(current);
    const { archived, parentId, ...rest } = changes;
    if (parentId) {
      if (parentId === id) throw this.invalidParent('A category cannot be its own parent');
      await this.assertParent(userId, parentId, current.kind);
      const children = await this.prisma.category.count({ where: { userId, parentId: id } });
      if (children > 0) throw this.invalidParent('A category with subcategories cannot be one');
    }
    try {
      const row = await this.prisma.category.update({
        where: { id },
        data: {
          ...rest,
          ...(parentId === undefined ? {} : { parentId }),
          ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
        },
      });
      return toCategoryDto(row);
    } catch (error) {
      throw this.duplicate(error);
    }
  }

  /**
   * CAT-04: moves movements, card charges, statement adjustments, fixed items and
   * subcategories to the target (same kind) and archives the source, in one transaction.
   */
  async merge(userId: string, id: string, targetId: string): Promise<MergeCategoryResponse> {
    const source = await this.getOwned(userId, id);
    this.assertNotSystem(source);
    if (targetId === id) {
      throw new AppException(
        'CATEGORY_MERGE_SAME',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'A category cannot be merged into itself',
      );
    }
    const target = await this.getOwned(userId, targetId, source.kind);
    if (target.archivedAt) {
      throw new AppException(
        'CATEGORY_ARCHIVED',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The target category is archived',
      );
    }

    const moved = await this.prisma.$transaction(async (tx) => {
      const counts = await Promise.all([
        tx.transaction.updateMany({
          where: { userId, categoryId: id },
          data: { categoryId: targetId },
        }),
        tx.cardCharge.updateMany({
          where: { userId, categoryId: id },
          data: { categoryId: targetId },
        }),
        tx.statementAdjustment.updateMany({
          where: { categoryId: id, statement: { userId } },
          data: { categoryId: targetId },
        }),
        tx.fixedItem.updateMany({
          where: { userId, categoryId: id },
          data: { categoryId: targetId },
        }),
      ]);
      // Subcategories follow their parent (the target itself, if it was one, becomes top level).
      if (target.parentId === id) {
        await tx.category.update({ where: { id: targetId }, data: { parentId: null } });
      }
      await tx.category.updateMany({
        where: { userId, parentId: id },
        data: {
          parentId: target.parentId === null || target.parentId === id ? targetId : target.parentId,
        },
      });
      await tx.category.update({ where: { id }, data: { archivedAt: new Date() } });
      return counts.reduce((sum, result) => sum + result.count, 0);
    });

    const updated = await this.prisma.category.findUniqueOrThrow({ where: { id: targetId } });
    return { target: toCategoryDto(updated), moved };
  }

  /** The id of a system category of the user (created on registration). */
  async systemId(
    client: Prisma.TransactionClient | PrismaService,
    userId: string,
    systemKey: CategorySystemKey,
  ): Promise<string> {
    const row = await client.category.findUniqueOrThrow({
      where: { userId_systemKey: { userId, systemKey } },
      select: { id: true },
    });
    return row.id;
  }

  /** A category of the user (404 otherwise), optionally of a given kind. */
  async getOwned(userId: string, id: string, kind?: CategoryKind): Promise<CategoryRow> {
    const row = await this.prisma.category.findFirst({ where: { id, userId } });
    if (!row) throw AppException.notFound('Category not found');
    if (kind && row.kind !== kind) {
      throw new AppException(
        'CATEGORY_KIND_MISMATCH',
        HttpStatus.UNPROCESSABLE_ENTITY,
        `The category is not an ${kind.toLowerCase()} category`,
      );
    }
    return row;
  }

  /** How many records use each category. */
  private async usage(userId: string): Promise<Map<string, number>> {
    const [transactions, charges, adjustments, fixed] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['categoryId'],
        where: { userId, categoryId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.cardCharge.groupBy({
        by: ['categoryId'],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.statementAdjustment.groupBy({
        by: ['categoryId'],
        where: { statement: { userId } },
        _count: { _all: true },
      }),
      this.prisma.fixedItem.groupBy({
        by: ['categoryId'],
        where: { userId },
        _count: { _all: true },
      }),
    ]);
    const usage = new Map<string, number>();
    for (const group of [...transactions, ...charges, ...adjustments, ...fixed]) {
      if (!group.categoryId) continue;
      usage.set(group.categoryId, (usage.get(group.categoryId) ?? 0) + group._count._all);
    }
    return usage;
  }

  /** Parents must be top-level categories of the same kind (one level of nesting). */
  private async assertParent(userId: string, parentId: string, kind: CategoryKind): Promise<void> {
    const parent = await this.getOwned(userId, parentId, kind);
    if (parent.parentId) throw this.invalidParent('Subcategories cannot have subcategories');
    if (parent.systemKey) throw this.invalidParent('System categories cannot have subcategories');
  }

  private assertNotSystem(row: CategoryRow): void {
    if (row.systemKey) {
      throw new AppException(
        'CATEGORY_SYSTEM',
        HttpStatus.CONFLICT,
        'System categories cannot be changed',
      );
    }
  }

  private invalidParent(detail: string): AppException {
    return new AppException('CATEGORY_INVALID_PARENT', HttpStatus.UNPROCESSABLE_ENTITY, detail);
  }

  private duplicate(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new AppException(
        'CATEGORY_EXISTS',
        HttpStatus.CONFLICT,
        'There is already a category with that name',
      );
    }
    return error;
  }
}
