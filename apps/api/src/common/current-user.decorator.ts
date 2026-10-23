import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };

/** The authenticated user, always taken from the access token (never from body or URL). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw new Error('CurrentUser used on a public route');
    return user;
  },
);
