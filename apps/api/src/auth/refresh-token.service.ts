import { HttpStatus, Injectable } from '@nestjs/common';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { AppException } from '../common/app-exception';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';

export const REFRESH_TOKEN_TTL_DAYS = 30;

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

/**
 * Opaque refresh tokens, stored only as an HMAC hash.
 * Each use rotates the token inside its family; presenting an already revoked token
 * revokes the whole family (possible theft).
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  issue(userId: string, family: string = randomUUID()): Promise<IssuedRefreshToken> {
    return this.create(this.prisma, userId, family);
  }

  /** Rotates a token. Returns the user and the new token, or throws 401. */
  async rotate(token: string): Promise<{ userId: string; next: IssuedRefreshToken }> {
    const now = new Date();
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(token) },
    });
    if (!current) throw sessionError('SESSION_INVALID');
    if (current.revokedAt) {
      // Reuse of a rotated token: revoke the whole family (outside the rotation transaction,
      // so the revocation is kept even though the request fails).
      await this.revokeFamilyById(current.family, now);
      throw sessionError('SESSION_REUSED');
    }
    if (current.expiresAt <= now) throw sessionError('SESSION_EXPIRED');

    const next = await this.prisma.$transaction(async (tx) => {
      // Conditional update: if two refreshes race, only one wins.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: now },
      });
      return count === 0 ? undefined : this.create(tx, current.userId, current.family);
    });
    if (!next) throw sessionError('SESSION_REUSED');
    return { userId: current.userId, next };
  }

  /** The user of a live token (not revoked, not expired), without rotating it. */
  async ownerOf(token: string | undefined): Promise<string | undefined> {
    if (!token) return undefined;
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(token) },
    });
    if (!current || current.revokedAt || current.expiresAt <= new Date()) return undefined;
    return current.userId;
  }

  /** Revokes the family of a token (logout). Unknown tokens are ignored. */
  async revokeFamily(token: string): Promise<void> {
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(token) },
    });
    if (current) await this.revokeFamilyById(current.family, new Date());
  }

  private async revokeFamilyById(family: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { family, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  private async create(
    client: Pick<PrismaService, 'refreshToken'>,
    userId: string,
    family: string,
  ): Promise<IssuedRefreshToken> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    await client.refreshToken.create({
      data: { userId, family, tokenHash: this.hash(token), expiresAt },
    });
    return { token, expiresAt };
  }

  private hash(token: string): string {
    return createHmac('sha256', this.config.env.REFRESH_TOKEN_PEPPER).update(token).digest('hex');
  }
}

function sessionError(code: string): AppException {
  return new AppException(code, HttpStatus.UNAUTHORIZED, 'The session is no longer valid');
}
