import { INestApplication } from '@nestjs/common';
import type { Account, Category } from '@platin/contracts';
import { as, TestUser } from './auth-helpers';

/** Creates an account through the API. */
export async function createAccount(
  app: INestApplication,
  user: TestUser,
  overrides: Partial<{ name: string; type: string; currency: string; initialBalance: string }> = {},
): Promise<Account> {
  const res = await as(app, user)
    .post('/api/v1/accounts')
    .send({
      name: 'Mercado Pago',
      type: 'WALLET',
      currency: 'ARS',
      initialBalance: '0',
      ...overrides,
    })
    .expect(201);
  return res.body;
}

/** One of the suggested categories every user starts with. */
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

export async function balanceOf(app: INestApplication, user: TestUser, accountId: string) {
  const res = await as(app, user).get(`/api/v1/accounts/${accountId}`).expect(200);
  return (res.body as Account).balance;
}
