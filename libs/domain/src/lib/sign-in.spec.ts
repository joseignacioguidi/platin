import {
  canRemoveSignInMethod,
  ProviderSignInFacts,
  resolveProviderSignIn,
  safeReturnPath,
} from './sign-in';

const facts = (overrides: Partial<ProviderSignInFacts> = {}): ProviderSignInFacts => ({
  profile: { providerUserId: 'g-1', email: 'Ana@Gmail.com', emailVerified: true },
  linkedUser: null,
  emailTaken: false,
  registrationOpen: true,
  isAdminEmail: false,
  ...overrides,
});

describe('resolveProviderSignIn', () => {
  it('signs in to the account already linked to the provider id', () => {
    expect(resolveProviderSignIn(facts({ linkedUser: { id: 'u1', suspended: false } }))).toEqual({
      kind: 'existing',
      userId: 'u1',
    });
  });

  it('keeps the account when the email changed in the provider', () => {
    const decision = resolveProviderSignIn(
      facts({
        profile: { providerUserId: 'g-1', email: 'otro@gmail.com', emailVerified: true },
        linkedUser: { id: 'u1', suspended: false },
        emailTaken: true,
      }),
    );
    expect(decision).toEqual({ kind: 'existing', userId: 'u1' });
  });

  it('rejects a suspended linked account', () => {
    expect(resolveProviderSignIn(facts({ linkedUser: { id: 'u1', suspended: true } }))).toEqual({
      kind: 'error',
      code: 'ACCOUNT_SUSPENDED',
    });
  });

  it('creates an account with the normalized email when nobody has it', () => {
    expect(resolveProviderSignIn(facts())).toEqual({ kind: 'create', email: 'ana@gmail.com' });
  });

  it('never links an existing email by itself', () => {
    expect(resolveProviderSignIn(facts({ emailTaken: true }))).toEqual({
      kind: 'error',
      code: 'ACCOUNT_EXISTS_LINK_REQUIRED',
    });
  });

  it('only accepts verified emails', () => {
    const unverified = { providerUserId: 'g-1', email: 'ana@gmail.com', emailVerified: false };
    expect(resolveProviderSignIn(facts({ profile: unverified }))).toEqual({
      kind: 'error',
      code: 'EMAIL_NOT_VERIFIED',
    });
    const missing = { providerUserId: 'g-1', email: null, emailVerified: true };
    expect(resolveProviderSignIn(facts({ profile: missing })).kind).toBe('error');
  });

  it('respects closed registration, except for admin emails', () => {
    expect(resolveProviderSignIn(facts({ registrationOpen: false }))).toEqual({
      kind: 'error',
      code: 'REGISTRATION_CLOSED',
    });
    expect(resolveProviderSignIn(facts({ registrationOpen: false, isAdminEmail: true })).kind).toBe(
      'create',
    );
  });
});

describe('canRemoveSignInMethod', () => {
  it('keeps at least one way to sign in', () => {
    expect(canRemoveSignInMethod({ hasPassword: false, identities: 1 })).toBe(false);
    expect(canRemoveSignInMethod({ hasPassword: true, identities: 1 })).toBe(true);
    expect(canRemoveSignInMethod({ hasPassword: false, identities: 2 })).toBe(true);
  });
});

describe('safeReturnPath', () => {
  it('accepts paths inside the app', () => {
    expect(safeReturnPath('/app/tarjetas?mes=2026-10')).toBe('/app/tarjetas?mes=2026-10');
    expect(safeReturnPath('/app/perfil')).toBe('/app/perfil');
  });

  it.each([
    undefined,
    null,
    '',
    'app',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    `/${'a'.repeat(600)}`,
  ])('falls back for %j', (path) => {
    expect(safeReturnPath(path)).toBe('/app');
  });

  it('uses the given fallback', () => {
    expect(safeReturnPath('//x', '/app/perfil')).toBe('/app/perfil');
  });
});
