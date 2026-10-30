import { INestApplication } from '@nestjs/common';
import type { Account, Card, Category, Charge, Pocket, StatementSummary } from '@platin/contracts';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { as, refreshCookie, registerUser, TestUser } from '../auth-helpers';
import { addPocket, category, createAccount } from '../fixtures';

export const PASSWORD = 'una-clave-segura';
export const ADMIN_EMAIL = 'admin@security.platin';
/** "Today" for every security suite: statements and fixed items are deterministic. */
export const TODAY = '2026-10-23';

/** Every resource a regular user owns in the security scenario. */
export interface Victim {
  user: TestUser;
  account: Account;
  /** The account's "Disponible" in pesos, with money. */
  ars: Pocket;
  usd: Pocket;
  investment: Pocket;
  category: Category;
  expenseCategory: Category;
  card: Card;
  charge: Charge;
  closedStatement: StatementSummary;
  openStatement: StatementSummary;
  transactionId: string;
  pendingId: string;
  transferId: string;
  fixedId: string;
  goalId: string;
  valuationId: string;
  identityId: string | null;
}

export interface Scenario {
  a: Victim;
  b: Victim;
  admin: TestUser;
  suspended: TestUser;
  /** Signed up with Google only: no password. */
  googleOnly: { id: string; email: string };
}

/** Logs a user in with the password and returns its tokens. */
export async function login(
  app: INestApplication,
  email: string,
  password = PASSWORD,
): Promise<TestUser> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return {
    id: res.body.user.id,
    email,
    accessToken: res.body.accessToken,
    cookie: refreshCookie(res.headers['set-cookie']),
  };
}

/**
 * Builds a user with one of everything (accounts with ARS and USD pockets, a card with an
 * installment charge and a closed statement, a fixed item, a goal, an investment with a
 * valuation and an own category), all through the API like a real client.
 */
export async function seedVictim(
  app: INestApplication,
  prisma: PrismaService,
  email: string,
): Promise<Victim> {
  const user = await registerUser(app, { email, password: PASSWORD, name: email.split('@')[0] });
  const api = as(app, user);

  const account = await createAccount(app, user, {
    name: `Banco de ${user.email}`,
    kind: 'BANK',
    initialBalance: '1000000',
  });
  const ars = account.pockets[0];
  const usd = await addPocket(app, user, account.id, {
    name: 'Dólares',
    kind: 'SAVINGS',
    currency: 'USD',
    initialBalance: '500',
  });
  const investment = await addPocket(app, user, account.id, {
    name: 'CEDEARs',
    kind: 'INVESTMENT',
    instrument: 'CEDEAR',
  });

  const own = (
    await api
      .post('/api/v1/categories')
      .send({ name: 'Mascotas', kind: 'EXPENSE', icon: 'paw-print', color: 'card' })
      .expect(201)
  ).body as Category;
  const expenseCategory = await category(app, user, 'Otros gastos');

  const transactionId = (
    await api
      .post('/api/v1/transactions')
      .send({
        type: 'EXPENSE',
        pocketId: ars.id,
        categoryId: own.id,
        amount: '1500',
        date: '2026-10-10',
        description: 'Alimento',
      })
      .expect(201)
  ).body.id as string;

  const transferId = (
    await api
      .post('/api/v1/transfers')
      .send({
        fromPocketId: ars.id,
        toPocketId: investment.id,
        amountOut: '100000',
        date: '2026-10-11',
      })
      .expect(201)
  ).body.id as string;
  const valuationId = (
    await api
      .post('/api/v1/investments/valuations')
      .send({ items: [{ pocketId: investment.id, date: '2026-10-20', value: '110000' }] })
      .expect(201)
  ).body.items[0].id as string;

  const card = (
    await api
      .post('/api/v1/cards')
      .send({ name: 'Visa', last4: '4821', creditLimit: '2000000', closingDay: 30, dueDay: 5 })
      .expect(201)
  ).body as Card;
  const charge = (
    await api
      .post(`/api/v1/cards/${card.id}/charges`)
      .send({
        categoryId: expenseCategory.id,
        currency: 'ARS',
        description: 'Heladera',
        date: '2026-09-10',
        totalAmount: '90000',
        installmentsCount: 3,
      })
      .expect(201)
  ).body as Charge;
  const statements = (
    await api.get(`/api/v1/cards/${card.id}/statements?from=2026-09&to=2026-12`).expect(200)
  ).body as StatementSummary[];
  const september = statements.find((s) => s.period === '2026-09');
  const october = statements.find((s) => s.period === '2026-10');
  if (!september || !october) throw new Error('Seed: missing statements');
  const closedStatement = (
    await api.post(`/api/v1/statements/${september.id}/close`).send({}).expect(200)
  ).body as StatementSummary;

  const fixedId = (
    await api
      .post('/api/v1/fixed')
      .send({
        kind: 'EXPENSE',
        name: 'Alquiler',
        categoryId: expenseCategory.id,
        pocketId: ars.id,
        amount: '300000',
        dayOfMonth: 1,
        startPeriod: '2026-10',
      })
      .expect(201)
  ).body.id as string;
  await api.post('/api/v1/sync').expect(200);
  const pending = (await api.get('/api/v1/movements?status=PENDING').expect(200)).body.items as {
    id: string;
  }[];
  if (pending.length === 0) throw new Error('Seed: the fixed item generated no pending movement');

  const goalId = (
    await api
      .post('/api/v1/goals')
      .send({
        name: 'Auto',
        targetAmount: '15000',
        currency: 'USD',
        targetPeriod: '2027-12',
        pocketIds: [usd.id],
      })
      .expect(201)
  ).body.id as string;

  const identity = await prisma.authIdentity.create({
    data: { userId: user.id, provider: 'GOOGLE', providerUserId: `google-${user.id}`, email },
  });

  return {
    user,
    account,
    ars,
    usd,
    investment,
    category: own,
    expenseCategory,
    card,
    charge,
    closedStatement,
    openStatement: october,
    transactionId,
    pendingId: pending[0].id,
    transferId,
    fixedId,
    goalId,
    valuationId,
    identityId: identity.id,
  };
}

/** Users A and B with full data, an admin, a suspended user and a Google-only user. */
export async function seedScenario(
  app: INestApplication,
  prisma: PrismaService,
): Promise<Scenario> {
  const a = await seedVictim(app, prisma, 'ana@security.platin');
  const b = await seedVictim(app, prisma, 'beto@security.platin');
  const admin = await registerUser(app, { email: ADMIN_EMAIL, password: PASSWORD });

  const suspended = await registerUser(app, {
    email: 'suspendido@security.platin',
    password: PASSWORD,
  });
  await prisma.user.update({ where: { id: suspended.id }, data: { status: 'SUSPENDED' } });

  const googleOnly = await prisma.user.create({
    data: {
      email: 'solo-google@security.platin',
      passwordHash: null,
      identities: {
        create: {
          provider: 'GOOGLE',
          providerUserId: 'google-only-1',
          email: 'solo-google@security.platin',
        },
      },
    },
  });
  return { a, b, admin, suspended, googleOnly: { id: googleOnly.id, email: googleOnly.email } };
}

/** Env for createTestApp: fixed "today" and the scenario's admin. */
export const SECURITY_ENV = { CLOCK_TODAY: TODAY, ADMIN_EMAILS: ADMIN_EMAIL };
