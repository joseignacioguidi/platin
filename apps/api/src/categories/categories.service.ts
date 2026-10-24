import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  Category,
  ColorToken,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from '@platin/contracts';
import type { CategoryKind } from '@platin/domain';
import { AppException } from '../common/app-exception';
import { Prisma, type Category as CategoryRow } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export function toCategoryDto(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    icon: row.icon,
    color: row.color as ColorToken,
    parentId: row.parentId,
    archived: row.archivedAt !== null,
  };
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, includeArchived = false): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({
      where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toCategoryDto);
  }

  async create(userId: string, request: CreateCategoryRequest): Promise<Category> {
    if (request.parentId) await this.getOwned(userId, request.parentId, request.kind);
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
    await this.getOwned(userId, id);
    const { archived, ...rest } = changes;
    try {
      const row = await this.prisma.category.update({
        where: { id },
        data: {
          ...rest,
          ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
        },
      });
      return toCategoryDto(row);
    } catch (error) {
      throw this.duplicate(error);
    }
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
