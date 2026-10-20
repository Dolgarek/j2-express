// L'accès aux données de Team, avec Prisma. La relation Team → Player se lit avec include.
import { prisma } from '../prisma.js';
import type { Team, TeamInput, TeamWithPlayers } from './team.schema.js';

const playerSummary = { select: { id: true, nickname: true, role: true, rating: true }, orderBy: { nickname: 'asc' as const } };

export const teams = {
  findOne(id: number): Promise<Team | null> {
    return prisma.team.findUnique({ where: { id } });
  },

  /** Une équipe avec ses joueurs : une requête avec include, au lieu de deux requêtes hier. */
  findOneWithPlayers(id: number): Promise<TeamWithPlayers | null> {
    return prisma.team.findUnique({ where: { id }, include: { players: playerSummary } });
  },

  /** Le niveau moyen d'une équipe (entier), ou null si elle n'a aucun joueur : aggregate = avg() en SQL. */
  async ratingOf(teamId: number): Promise<number | null> {
    const { _avg } = await prisma.player.aggregate({ where: { teamId }, _avg: { rating: true } });
    return _avg.rating === null ? null : Math.round(_avg.rating);
  },

  findByCountry(country?: string): Promise<Team[]> {
    return prisma.team.findMany({ where: country ? { country } : undefined, orderBy: { name: 'asc' } });
  },

  insert(data: TeamInput): Promise<Team> {
    return prisma.team.create({ data });
  },

  async update(id: number, data: Partial<TeamInput>): Promise<Team | null> {
    if (!(await prisma.team.findUnique({ where: { id }, select: { id: true } }))) return null;
    return prisma.team.update({ where: { id }, data });
  },

  async delete(id: number): Promise<boolean> {
    const { count } = await prisma.team.deleteMany({ where: { id } });
    return count > 0;
  },
};
