// L'accès aux données de Player, avec Prisma. La « vue » (sans birthDate, avec l'équipe réduite)
// est un select : on choisit les colonnes, Prisma construit la jointure.
import { prisma } from '../prisma.js';
import type { PlayerInput, PlayerSearch, PlayerSummary, PlayerView, TopQuery } from './player.schema.js';

// Le select de la vue : réutilisé partout, comme la constante VIEW d'hier
const view = {
  id: true,
  nickname: true,
  country: true,
  role: true,
  rating: true,
  team: { select: { id: true, name: true, tag: true } },
} as const;

export const players = {
  findView(id: number): Promise<PlayerView | null> {
    return prisma.player.findUnique({ where: { id }, select: view });
  },

  /** Recherche paginée : le where se construit comme un objet ; le total est une seconde requête (count). */
  async search({ page, limit, country, teamId, q }: PlayerSearch): Promise<{ items: PlayerView[]; total: number }> {
    const where = {
      ...(country && { country }),
      ...(teamId && { teamId }),
      ...(q && { nickname: { contains: q, mode: 'insensitive' as const } }), // ILIKE '%q%', sans écrire le %
    };
    const [items, total] = await prisma.$transaction([
      prisma.player.findMany({ where, select: view, orderBy: { nickname: 'asc' }, skip: (page - 1) * limit, take: limit }),
      prisma.player.count({ where }),
    ]);
    return { items, total };
  },

  findTop({ limit, country }: TopQuery): Promise<PlayerView[]> {
    return prisma.player.findMany({
      where: country ? { country } : undefined,
      select: view,
      orderBy: [{ rating: 'desc' }, { nickname: 'asc' }],
      take: limit,
    });
  },

  findByTeam(teamId: number): Promise<PlayerSummary[]> {
    return prisma.player.findMany({
      where: { teamId },
      select: { id: true, nickname: true, role: true, rating: true },
      orderBy: { nickname: 'asc' },
    });
  },

  /** birthDate arrive en chaîne AAAA-MM-JJ : Prisma veut un Date pour une colonne DATE. */
  insert({ birthDate, ...data }: PlayerInput): Promise<{ id: number }> {
    return prisma.player.create({ data: { ...data, birthDate: toDate(birthDate) }, select: { id: true } });
  },

  async update(id: number, { birthDate, ...data }: Partial<PlayerInput>): Promise<{ id: number } | null> {
    if (!(await prisma.player.findUnique({ where: { id }, select: { id: true } }))) return null;
    return prisma.player.update({ where: { id }, data: { ...data, birthDate: toDate(birthDate) }, select: { id: true } });
  },

  async delete(id: number): Promise<boolean> {
    const { count } = await prisma.player.deleteMany({ where: { id } });
    return count > 0;
  },
};

/** undefined reste undefined (clé absente : Prisma n'y touche pas), null reste null (vider), une chaîne devient un Date. */
function toDate(date: string | null | undefined): Date | null | undefined {
  return date == null ? date : new Date(date);
}
