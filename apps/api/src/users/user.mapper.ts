import { type User, type UserPreferences, userPreferencesSchema } from '@platin/contracts';
import type { User as UserRow } from '../generated/prisma/client';

/** Stored preferences that no longer validate (a removed shortcut, say) fall back to defaults. */
export function readPreferences(raw: unknown): UserPreferences {
  const parsed = userPreferencesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

export function toUserDto(user: UserRow): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    baseCurrency: user.baseCurrency,
    valuationRate: user.valuationRate,
    role: user.role,
    preferences: readPreferences(user.preferences),
  };
}
