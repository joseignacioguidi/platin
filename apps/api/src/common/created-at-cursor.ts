import { HttpStatus } from '@nestjs/common';
import { AppException } from './app-exception';

/** Position in a list ordered by createdAt desc, id desc (users, audit). */
export interface CreatedAtCursor {
  createdAt: Date;
  id: string;
}

export function encodeCreatedAtCursor(cursor: CreatedAtCursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`).toString('base64url');
}

export function decodeCreatedAtCursor(value: string): CreatedAtCursor {
  const [createdAt, id] = Buffer.from(value, 'base64url').toString().split('|');
  const date = new Date(createdAt);
  if (!id || Number.isNaN(date.getTime())) {
    throw new AppException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'Invalid cursor');
  }
  return { createdAt: date, id };
}

/** Prisma `where` for "strictly after the cursor". */
export function afterCreatedAtCursor(value: string | undefined) {
  if (!value) return {};
  const cursor = decodeCreatedAtCursor(value);
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

/** Splits the `limit + 1` rows read into a page and the cursor of the next one. */
export function toPage<T extends CreatedAtCursor>(
  rows: T[],
  limit: number,
): { rows: T[]; nextCursor: string | null } {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    rows: page,
    nextCursor: rows.length > limit && last ? encodeCreatedAtCursor(last) : null,
  };
}
