import { HttpStatus, Injectable } from '@nestjs/common';
import type { SignInMethodsResponse } from '@platin/contracts';
import { canRemoveSignInMethod } from '@platin/domain';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';

/** AUTH-07 and AUTH-08: the ways an account can sign in. */
@Injectable()
export class SignInMethodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async list(userId: string): Promise<SignInMethodsResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true, identities: { orderBy: { createdAt: 'asc' } } },
    });
    return {
      hasPassword: user.passwordHash !== null,
      identities: user.identities.map((identity) => ({
        id: identity.id,
        provider: identity.provider,
        email: identity.email,
        createdAt: identity.createdAt.toISOString(),
        lastUsedAt: identity.lastUsedAt?.toISOString() ?? null,
      })),
    };
  }

  /** Unlinks a provider, unless it is the last way to sign in (LAST_SIGN_IN_METHOD). */
  async unlink(userId: string, identityId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Lock the user so two unlinks at once can't leave the account without a method.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      const identity = await tx.authIdentity.findFirst({ where: { id: identityId, userId } });
      if (!identity) throw AppException.notFound();
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { passwordHash: true, _count: { select: { identities: true } } },
      });
      const methods = {
        hasPassword: user.passwordHash !== null,
        identities: user._count.identities,
      };
      if (!canRemoveSignInMethod(methods)) {
        throw new AppException(
          'LAST_SIGN_IN_METHOD',
          HttpStatus.CONFLICT,
          'The account needs at least one way to sign in',
        );
      }
      await tx.authIdentity.delete({ where: { id: identity.id } });
    });
  }

  /** AUTH-08: a password for an account created with a provider. Never replaces one. */
  async setPassword(userId: string, password: string): Promise<void> {
    const passwordHash = await this.passwords.hash(password);
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, passwordHash: null },
      data: { passwordHash },
    });
    if (count === 0) {
      throw new AppException(
        'PASSWORD_ALREADY_SET',
        HttpStatus.CONFLICT,
        'The account already has a password',
      );
    }
  }
}
