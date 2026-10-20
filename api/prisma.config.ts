// Configuration de la CLI Prisma (prisma db pull, prisma generate, prisma studio…).
// L'URL de la base vient de l'environnement (compose.yaml), comme pour pg.
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DATABASE_URL'] },
});
