import type { User } from '@platin/contracts';
import type { User as UserRow } from '../generated/prisma/client';

export function toUserDto(user: UserRow): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    baseCurrency: user.baseCurrency,
    valuationRate: user.valuationRate,
  };
}
