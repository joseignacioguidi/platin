import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from './app-exception';
import { AuthenticatedRequest } from './current-user.decorator';

/**
 * Lets only active admins through. Checks the role in the database on every request instead
 * of trusting the token's claim, so losing the role takes effect immediately.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const userId = context.switchToHttp().getRequest<AuthenticatedRequest>().user?.id;
    const user = userId
      ? await this.prisma.user.findUnique({
          where: { id: userId },
          select: { role: true, status: true },
        })
      : null;
    if (user?.role !== 'ADMIN' || user.status !== 'ACTIVE') {
      throw new AppException('FORBIDDEN', HttpStatus.FORBIDDEN, 'Only administrators');
    }
    return true;
  }
}

/** Marks a controller or route as admin-only (ADM-01). */
export const AdminOnly = () => applyDecorators(UseGuards(AdminGuard));
