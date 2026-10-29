/** What the provider says about the person after a successful sign-in. */
export interface ProviderProfile {
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
}

export interface SignInCandidate {
  id: string;
  suspended: boolean;
}

export interface ProviderSignInFacts {
  profile: ProviderProfile;
  /** The account already linked to this provider id, if any. */
  linkedUser: SignInCandidate | null;
  /** Whether an account with the profile's email already exists. */
  emailTaken: boolean;
  registrationOpen: boolean;
  /** Admin emails can still sign up with registration closed (as with a password). */
  isAdminEmail: boolean;
}

export type ProviderSignInDecision =
  | { kind: 'existing'; userId: string }
  | { kind: 'create'; email: string }
  | { kind: 'error'; code: ProviderSignInError };

export type ProviderSignInError =
  | 'ACCOUNT_SUSPENDED'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_EXISTS_LINK_REQUIRED'
  | 'REGISTRATION_CLOSED';

/**
 * "Ingreso con proveedores": the provider id decides the account, never the email. An email
 * that already has an account is not linked automatically, so nobody can take over an
 * account by registering its email with a provider first.
 */
export function resolveProviderSignIn(facts: ProviderSignInFacts): ProviderSignInDecision {
  const { profile, linkedUser } = facts;
  if (linkedUser) {
    return linkedUser.suspended
      ? { kind: 'error', code: 'ACCOUNT_SUSPENDED' }
      : { kind: 'existing', userId: linkedUser.id };
  }
  if (!profile.email || !profile.emailVerified)
    return { kind: 'error', code: 'EMAIL_NOT_VERIFIED' };
  if (facts.emailTaken) return { kind: 'error', code: 'ACCOUNT_EXISTS_LINK_REQUIRED' };
  if (!facts.registrationOpen && !facts.isAdminEmail) {
    return { kind: 'error', code: 'REGISTRATION_CLOSED' };
  }
  return { kind: 'create', email: profile.email.trim().toLowerCase() };
}

/** Whether a sign-in method can be removed: an account always keeps at least one. */
export function canRemoveSignInMethod(methods: {
  hasPassword: boolean;
  identities: number;
}): boolean {
  return (methods.hasPassword ? 1 : 0) + methods.identities > 1;
}

/**
 * A path inside the app to return to after an external sign-in, or the fallback. Only
 * relative paths are accepted ("/..." but not "//host" or "/\host", which browsers treat as
 * another site), so the redirect can never leave the app.
 */
export function safeReturnPath(path: string | null | undefined, fallback = '/app'): string {
  if (!path || path.length > 512) return fallback;
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return fallback;
  // Control characters (tabs, newlines) are stripped by URL parsers and could form "//".
  if (/[\u0000-\u001f\u007f]/.test(path)) return fallback;
  return path;
}
