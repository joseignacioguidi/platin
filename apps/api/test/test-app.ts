import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app/app.module';
import { configureApp } from '../src/app/configure-app';
import { OAUTH_PROVIDERS, OAuthProvider } from '../src/auth/oauth/oauth-provider';
import { PrismaService } from '../src/prisma/prisma.service';
import { RateProvider } from '../src/rates/rate-provider';
import { FakeRateProvider } from './fake-rates';
import { loadTestEnv } from './test-env';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  /** The rates source the app uses (never the real DolarApi in tests). */
  rates: FakeRateProvider;
}

export interface TestAppOptions {
  /** Sign-in providers to use instead of the ones built from the environment (never Google). */
  oauthProviders?: OAuthProvider[];
}

/** Boots the real AppModule against the test database. */
export async function createTestApp(
  env: Record<string, string> = {},
  options: TestAppOptions = {},
): Promise<TestContext> {
  loadTestEnv();
  Object.assign(process.env, env);
  const rates = new FakeRateProvider();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(RateProvider)
    .useValue(rates);
  if (options.oauthProviders) {
    builder = builder.overrideProvider(OAUTH_PROVIDERS).useValue(options.oauthProviders);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService), rates };
}

/** Empties every table (except Prisma's migration log) between tests. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  await seedPlans(prisma);
}

export const UNLIMITED = {
  maxAccounts: null,
  maxPockets: null,
  maxCards: null,
  maxGoals: null,
  maxFixed: null,
  investments: true,
};

/**
 * The truncate also empties the plans the migration creates: seed a default "free" plan with no
 * limits (so suites about other features never hit one) and a "pro". Plan tests set their own.
 */
export async function seedPlans(prisma: PrismaService): Promise<void> {
  await prisma.plan.createMany({
    data: [
      {
        key: 'free',
        name: 'Gratis',
        description: '',
        limits: UNLIMITED,
        isDefault: true,
        sortOrder: 0,
      },
      { key: 'pro', name: 'Pro', description: '', limits: UNLIMITED, sortOrder: 1 },
    ],
  });
}
