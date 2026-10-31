import { Injectable } from '@nestjs/common';
import type { UpdateUserRequest, User } from '@platin/contracts';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import { readPreferences, toUserDto } from './user.mapper';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppException.notFound('User not found');
    return toUserDto(user);
  }

  async update(userId: string, changes: UpdateUserRequest): Promise<User> {
    const { preferences, ...fields } = changes;
    const user = await this.prisma.$transaction(async (tx) => {
      // Row lock: two devices saving different preferences don't lose each other's keys.
      const rows = await tx.$queryRaw<{ preferences: unknown }[]>`
        SELECT preferences FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      if (rows.length === 0) throw AppException.notFound('User not found');
      return tx.user.update({
        where: { id: userId },
        data: {
          ...fields,
          ...(preferences
            ? { preferences: { ...readPreferences(rows[0].preferences), ...preferences } }
            : {}),
        },
      });
    });
    return toUserDto(user);
  }
}
