import { onboardingStateSchema } from '@platin/contracts';
import { finishedOnboardingState, type OnboardingState } from '@platin/domain';
import type { Prisma } from '../generated/prisma/client';

type Client = Pick<Prisma.TransactionClient, 'user' | '$queryRaw'>;

const asObject = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

/**
 * The onboarding state stored in User.preferences (ADR 0035). Accounts from before iteration 13
 * have none, and an unreadable one is treated the same: done, so they never see it.
 */
export function readOnboarding(preferences: unknown): OnboardingState {
  const parsed = onboardingStateSchema.safeParse(asObject(preferences)['onboarding']);
  return parsed.success ? parsed.data : finishedOnboardingState();
}

/** The raw `onboarding` key, to carry over when other preferences change. */
export function storedOnboarding(preferences: unknown): { onboarding?: unknown } {
  const raw = asObject(preferences)['onboarding'];
  return raw === undefined ? {} : { onboarding: raw };
}

/**
 * Reads the state with the user's row locked, applies `change` and writes it back, leaving the
 * other preferences alone. Returns the new state; `change` returning the same object writes
 * nothing.
 */
export async function updateOnboarding(
  tx: Client,
  userId: string,
  change: (state: OnboardingState) => OnboardingState,
): Promise<OnboardingState> {
  const rows = await tx.$queryRaw<{ preferences: unknown }[]>`
    SELECT preferences FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
  const preferences = asObject(rows[0]?.preferences);
  const current = readOnboarding(preferences);
  const next = change(current);
  if (next !== current) await writeOnboarding(tx, userId, next, preferences);
  return next;
}

/** Writes the state over whatever the user had (registration, starting over). */
export async function writeOnboarding(
  tx: Client,
  userId: string,
  state: OnboardingState,
  current?: Record<string, unknown>,
): Promise<void> {
  const preferences =
    current ?? asObject((await tx.user.findUnique({ where: { id: userId } }))?.preferences);
  await tx.user.update({
    where: { id: userId },
    data: { preferences: { ...preferences, onboarding: { ...state } } as Prisma.InputJsonValue },
  });
}
