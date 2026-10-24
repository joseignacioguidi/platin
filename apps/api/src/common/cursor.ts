import { HttpStatus } from '@nestjs/common';
import { AppException } from './app-exception';

/** Position in a list ordered by date desc, createdAt desc, id desc. */
export interface Cursor {
  date: Date;
  createdAt: Date;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  const raw = `${cursor.date.toISOString()}|${cursor.createdAt.toISOString()}|${cursor.id}`;
  return Buffer.from(raw).toString('base64url');
}

export function decodeCursor(value: string): Cursor {
  const [date, createdAt, id] = Buffer.from(value, 'base64url').toString().split('|');
  const cursor = { date: new Date(date), createdAt: new Date(createdAt), id };
  if (!id || Number.isNaN(cursor.date.getTime()) || Number.isNaN(cursor.createdAt.getTime())) {
    throw new AppException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'Invalid cursor');
  }
  return cursor;
}

/** Prisma `where` for "strictly after the cursor" in date desc, createdAt desc, id desc order. */
export function afterCursor(cursor: Cursor | undefined) {
  if (!cursor) return {};
  return {
    OR: [
      { date: { lt: cursor.date } },
      { date: cursor.date, createdAt: { lt: cursor.createdAt } },
      { date: cursor.date, createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

export function compareByCursorOrder(a: Cursor, b: Cursor): number {
  return (
    b.date.getTime() - a.date.getTime() ||
    b.createdAt.getTime() - a.createdAt.getTime() ||
    (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );
}
