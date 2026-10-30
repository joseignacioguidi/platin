import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../common/app-exception';
import { AuthenticatedRequest } from '../common/current-user.decorator';
import { IS_PUBLIC } from '../common/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

interface AccessTokenPayload {
  sub: string;
}

/**
 * Global guard: every route needs a valid access token unless marked @Public(), and its user
 * must still exist and be active. The token lives 15 minutes; without this check a suspended
 * user kept working until it expired (SEC-F02) and a deleted one got 500s (SEC-F03).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = (request.header('authorization') ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthorized();
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw unauthorized();
    }
    // A 401 (not a 403) so the web tries a refresh, which fails for them, and goes to the login,
    // which explains a suspension.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true },
    });
    if (user?.status !== 'ACTIVE') throw unauthorized();
    request.user = { id: payload.sub };
    return true;
  }
}

function unauthorized(): AppException {
  return new AppException(
    'UNAUTHORIZED',
    HttpStatus.UNAUTHORIZED,
    'Missing or invalid access token',
  );
}
