import { Injectable } from '@nestjs/common';
import type { UpdateUserRequest, User } from '@platin/contracts';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import { toUserDto } from './user.mapper';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppException.notFound('User not found');
    return toUserDto(user);
  }

  async update(userId: string, changes: UpdateUserRequest): Promise<User> {
    await this.get(userId);
    const user = await this.prisma.user.update({ where: { id: userId }, data: changes });
    return toUserDto(user);
  }
}
