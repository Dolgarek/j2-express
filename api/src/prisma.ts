// Le client Prisma : UN objet pour tout le projet, typé d'après prisma/schema.prisma (prisma generate).
// Prisma 7 parle à PostgreSQL via un « driver adapter » : ici le même paquet pg qu'hier.
import { PrismaPg } from '@prisma/adapter-pg';
import { HttpError } from './errors.js';
import { PrismaClient, Prisma } from './generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });

/** "team_id" → "teamId" (les contraintes citent les colonnes SQL) */
function toCamelCase(column: string): string {
  return column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/** Le nom de la contrainte SQL en cause (« team_name_key », « player_team_id_fkey »), tel que l'adaptateur pg le rapporte. */
function constraintOf(err: Prisma.PrismaClientKnownRequestError): string {
  const meta = err.meta as { driverAdapterError?: { cause?: { constraint?: { index?: string }; originalMessage?: string } } } | undefined;
  const cause = meta?.driverAdapterError?.cause;
  return cause?.constraint?.index ?? cause?.originalMessage?.match(/constraint "([^"]+)"/)?.[1] ?? '';
}

/** « team_name_key » → « name », « player_team_id_fkey » → « teamId », « player_rating_check » → « rating » */
function fieldOf(err: Prisma.PrismaClientKnownRequestError): string {
  const column = constraintOf(err).replace(/^\w+?_(.+)_(key|fkey|check)$/, '$1');
  return toCamelCase(column || 'unknown');
}

/**
 * Traduit une erreur Prisma en HttpError, ou renvoie null si ce n'en est pas une.
 * L'équivalent de translatePgError, avec des codes Prisma au lieu des codes PostgreSQL :
 *   P2002 : contrainte UNIQUE  → 409 Conflict
 *   P2003 : clé étrangère      → 422 (l'équipe n'existe pas)
 *   P2039 : contrainte CHECK   → 422 (rating hors bornes… normalement arrêté par zod avant)
 *   P2020 : valeur hors type   → 422 (un id au-delà de 2 147 483 647, integer)
 *   P2025 : ligne introuvable  → 404 (update/delete d'un id inconnu)
 */
export function translatePrismaError(err: unknown): HttpError | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return null;
  switch (err.code) {
    case 'P2002':
      return new HttpError(409, 'Conflict', [{ path: fieldOf(err), message: 'already exists' }]);
    case 'P2003':
      return new HttpError(422, 'Validation Failed', [{ path: fieldOf(err), message: 'does not exist' }]);
    case 'P2039':
      return new HttpError(422, 'Validation Failed', [{ path: fieldOf(err), message: 'invalid value' }]);
    case 'P2020':
      return new HttpError(422, 'Validation Failed', [{ path: fieldOf(err), message: 'value out of range' }]);
    case 'P2025':
      return new HttpError(404, 'Not Found');
    default:
      return null;
  }
}
