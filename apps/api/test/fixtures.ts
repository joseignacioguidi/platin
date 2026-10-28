import { INestApplication } from '@nestjs/common';
import type { Account, Category, Pocket } from '@platin/contracts';
import { as, TestUser } from './auth-helpers';

let accounts = 0;

/** Creates an account (with its "Disponible" in pesos) through the API. */
export async function createAccount(
  app: INestApplication,
  user: TestUser,
  overrides: Partial<{ name: string; kind: string; initialBalance: string }> = {},
): Promise<Account> {
  const res = await as(app, user)
    .post('/api/v1/accounts')
    .send({ name: `Cuenta ${++accounts}`, kind: 'WALLET', initialBalance: '0', ...overrides })
    .expect(201);
  return res.body;
}

/** Adds a pocket to an account through the API. */
export async function addPocket(
  app: INestApplication,
  user: TestUser,
  accountId: string,
  overrides: Partial<{
    name: string;
    kind: string;
    currency: string;
    instrument: string | null;
    initialBalance: string;
  }> = {},
): Promise<Pocket> {
  const kind = overrides.kind ?? 'SAVINGS';
  const res = await as(app, user)
    .post(`/api/v1/accounts/${accountId}/pockets`)
    .send({
      name: `Apartado ${++accounts}`,
      kind,
      currency: 'ARS',
      instrument: kind === 'INVESTMENT' ? 'CEDEAR' : null,
      initialBalance: '0',
      ...overrides,
    })
    .expect(201);
  return res.body;
}

/**
 * A pocket ready to move money, in its own account: the "Disponible" in pesos or, for another
 * currency or kind, a new pocket of that account. Most tests only need "somewhere with a
 * balance", as accounts were before pockets.
 */
export async function createPocket(
  app: INestApplication,
  user: TestUser,
  overrides: Partial<{
    name: string;
    accountName: string;
    kind: string;
    currency: string;
    initialBalance: string;
  }> = {},
): Promise<Pocket> {
  const {
    name,
    accountName,
    kind = 'AVAILABLE',
    currency = 'ARS',
    initialBalance = '0',
  } = overrides;
  const simple = kind === 'AVAILABLE' && currency === 'ARS';
  const account = await createAccount(app, user, {
    name: accountName ?? name ?? `Cuenta ${++accounts}`,
    initialBalance: simple ? initialBalance : '0',
  });
  if (simple) return account.pockets[0];
  return addPocket(app, user, account.id, {
    name: name ?? (currency === 'USD' ? 'Dólares' : 'Ahorro'),
    kind,
    currency,
    initialBalance,
  });
}

/** One of the categories every user starts with. */
export async function category(
  app: INestApplication,
  user: TestUser,
  name: string,
): Promise<Category> {
  const res = await as(app, user).get('/api/v1/categories').expect(200);
  const found = (res.body as Category[]).find((c) => c.name === name);
  if (!found) throw new Error(`No category named ${name}`);
  return found;
}

export async function balanceOf(app: INestApplication, user: TestUser, pocketId: string) {
  const res = await as(app, user).get(`/api/v1/pockets/${pocketId}`).expect(200);
  return (res.body as Pocket).balance;
}
