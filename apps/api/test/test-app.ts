import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app/app.module';
import { configureApp } from '../src/app/configure-app';
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

/** Boots the real AppModule against the test database. */
export async function createTestApp(env: Record<string, string> = {}): Promise<TestContext> {
  loadTestEnv();
  Object.assign(process.env, env);
  const rates = new FakeRateProvider();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(RateProvider)
    .useValue(rates)
    .compile();
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
}
