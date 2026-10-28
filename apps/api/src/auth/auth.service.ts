import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthResponse, LoginRequest, RegisterRequest } from '@platin/contracts';
import { AppException } from '../common/app-exception';
import { AppConfig } from '../config/app-config';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
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
    private readonly settings: SettingsService,
    private readonly config: AppConfig,
  ) {}

  async register(request: RegisterRequest): Promise<Session> {
    // With sign-up closed, only the configured admins can still create their account.
    if (!this.isAdminEmail(request.email) && !(await this.settings.value('registration')).open) {
      throw new AppException(
        'REGISTRATION_CLOSED',
        HttpStatus.FORBIDDEN,
        'Sign-up is closed for now',
      );
    }
    const passwordHash = await this.passwords.hash(request.password);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const { rateType } = await this.settings.value('default-rate', tx);
        const created = await tx.user.create({
          data: {
            email: request.email,
            passwordHash,
            name: request.name ?? null,
            valuationRate: rateType,
          },
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
    if (user.status === 'SUSPENDED') throw suspended();
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

  /** Also syncs the role with ADMIN_EMAILS, so a change shows up on the next refresh. */
  private async buildResponse(userId: string): Promise<AuthResponse> {
    let user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.status === 'SUSPENDED') throw suspended();
    const role = this.isAdminEmail(user.email) ? 'ADMIN' : 'USER';
    if (user.role !== role) {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { role } });
    }
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return { accessToken, user: toUserDto(user) };
  }

  private isAdminEmail(email: string): boolean {
    return this.config.env.ADMIN_EMAILS.includes(email.toLowerCase());
  }
}

function suspended(): AppException {
  return new AppException('ACCOUNT_SUSPENDED', HttpStatus.FORBIDDEN, 'This account is suspended');
}
