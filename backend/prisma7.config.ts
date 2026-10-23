// Prisma CLI configuration (Prisma ORM 7). The connection string is read from the
// environment (`backend/.env` locally, real env vars in CI/production); never inline it here.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
