import { config } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

// Local development reads the repo root .env; deployed environments inject real env vars.
config({ path: resolve(__dirname, '../../.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection. Optional so `prisma generate` runs without a database.
    url: process.env.DIRECT_URL ?? '',
  },
});
