// L'accès aux données de Game, avec Prisma : plus de SQL, plus de BaseRepository. Chaque méthode
// est un appel du client généré (prisma.game.findMany…), typé d'après le schéma.
import { prisma } from '../prisma.js';
import type { Game, GameInput, Genre } from './game.schema.js';

export const games = {
  findAll(page = 1, limit = 10): Promise<Game[]> {
    return prisma.game.findMany({ orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit }) as Promise<Game[]>;
  },

  findOne(id: number): Promise<Game | null> {
    return prisma.game.findUnique({ where: { id } }) as Promise<Game | null>;
  },

  findByGenre(genre: Genre): Promise<Game[]> {
    return prisma.game.findMany({ where: { genre }, orderBy: { name: 'asc' } }) as Promise<Game[]>;
  },

  insert(data: GameInput): Promise<Game> {
    return prisma.game.create({ data }) as Promise<Game>;
  },

  /** PATCH : Prisma ignore les clés undefined ; un id inconnu lève P2025 → on renvoie null comme avant. */
  async update(id: number, data: Partial<GameInput>): Promise<Game | null> {
    if (!(await prisma.game.findUnique({ where: { id }, select: { id: true } }))) return null;
    return (await prisma.game.update({ where: { id }, data })) as Game;
  },

  async delete(id: number): Promise<boolean> {
    const { count } = await prisma.game.deleteMany({ where: { id } }); // deleteMany : 0 ligne n'est pas une erreur
    return count > 0;
  },
};
