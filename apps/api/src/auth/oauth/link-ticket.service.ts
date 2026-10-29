import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { AppException } from '../../common/app-exception';
import { ClockService } from '../../common/clock.service';
import type { AuthProvider } from '../../generated/prisma/client';

export const LINK_TICKET_TTL_MS = 60_000;

interface PendingLink {
  userId: string;
  provider: AuthProvider;
  expiresAt: number;
}

/**
 * One-use tickets that carry the signed-in user into the link flow (AUTH-07): a full-page
 * navigation to /start can't send the in-memory access token. They live in memory for 60
 * seconds (one API instance; a restart only makes the user click "Vincular" again) and are
 * stored hashed.
 */
@Injectable()
export class LinkTicketService {
  private readonly pending = new Map<string, PendingLink>();

  constructor(private readonly clock: ClockService) {}

  issue(userId: string, provider: AuthProvider): { ticket: string; expiresAt: Date } {
    this.sweep();
    const ticket = randomBytes(32).toString('base64url');
    const expiresAt = this.clock.now().getTime() + LINK_TICKET_TTL_MS;
    this.pending.set(hash(ticket), { userId, provider, expiresAt });
    return { ticket, expiresAt: new Date(expiresAt) };
  }

  /** The user the ticket was issued to. A ticket works once, and only for its provider. */
  consume(ticket: string | undefined, provider: AuthProvider): string {
    const key = ticket ? hash(ticket) : undefined;
    const link = key ? this.pending.get(key) : undefined;
    if (key) this.pending.delete(key);
    if (!link || link.provider !== provider || link.expiresAt <= this.clock.now().getTime()) {
      throw new AppException(
        'LINK_TICKET_INVALID',
        HttpStatus.BAD_REQUEST,
        'The link ticket is invalid or expired',
      );
    }
    return link.userId;
  }

  private sweep(): void {
    const now = this.clock.now().getTime();
    for (const [key, link] of this.pending) if (link.expiresAt <= now) this.pending.delete(key);
  }
}

function hash(ticket: string): string {
  return createHash('sha256').update(ticket).digest('hex');
}
