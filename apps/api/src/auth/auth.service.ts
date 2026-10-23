import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthResponse, LoginRequest, RegisterRequest } from '@platin/contracts';
import { AppException } from '../common/app-exception';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toUserDto } from '../users/user.mapper';
import { PasswordService } from './password.service';
import { IssuedRefreshToken, RefreshTokenService } from './refresh-token.service';
import { UserOnboardingService } from './user-onboarding.service';

export interface Session {
  response: AuthResponse;
  refreshToken: IssuedRefreshToken;
}

@Injectable()
export class AuthService {
  /** Verified when the email doesn't exist, so both paths take about the same time. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly onboarding: UserOnboardingService,
  ) {}

  async register(request: RegisterRequest): Promise<Session> {
    const passwordHash = await this.passwords.hash(request.password);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { email: request.email, passwordHash, name: request.name ?? null },
        });
        await this.onboarding.setUp(tx, created.id);
        return created;
      });
      return await this.startSession(user.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          'EMAIL_TAKEN',
          HttpStatus.CONFLICT,
          'There is already an account with that email',
        );
      }
      throw error;
    }
  }

  async login(request: LoginRequest): Promise<Session> {
    const user = await this.prisma.user.findUnique({ where: { email: request.email } });
    this.dummyHash ??= this.passwords.hash('timing-equalizer-password');
    const hash = user?.passwordHash ?? (await this.dummyHash);
    const valid = await this.passwords.verify(hash, request.password);
    if (!user || !valid) {
      throw new AppException(
        'INVALID_CREDENTIALS',
        HttpStatus.UNAUTHORIZED,
        'Wrong email or password',
      );
    }
    return this.startSession(user.id);
  }

  async refresh(token: string | undefined): Promise<Session> {
    if (!token) {
      throw new AppException('SESSION_INVALID', HttpStatus.UNAUTHORIZED, 'There is no session');
    }
    const { userId, next } = await this.refreshTokens.rotate(token);
    return { response: await this.buildResponse(userId), refreshToken: next };
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.refreshTokens.revokeFamily(token);
  }

  private async startSession(userId: string): Promise<Session> {
    const refreshToken = await this.refreshTokens.issue(userId);
    return { response: await this.buildResponse(userId), refreshToken };
  }

  private async buildResponse(userId: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const accessToken = await this.jwt.signAsync({ sub: user.id });
    return { accessToken, user: toUserDto(user) };
  }
}
