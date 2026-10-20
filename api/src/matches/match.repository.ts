// L'accès aux données de Match, avec Prisma. La vue (deux équipes, le gagnant, le statut) est
// construite en TypeScript à partir d'un include : ce que json_build_object faisait en SQL hier.
import { prisma } from '../prisma.js';
import type { Match, MatchInput, MatchStatus, MatchView } from './match.schema.js';
import type { MatchResult } from './simulator.js';

const teamSummary = { select: { id: true, name: true, tag: true } };
const include = { teamA: teamSummary, teamB: teamSummary, winner: { select: { tag: true } } };
type Row = Match & { teamA: { id: number; name: string; tag: string }; teamB: { id: number; name: string; tag: string }; winner: { tag: string } | null };

function toView(m: Row): MatchView {
  const played = m.playedAt !== null;
  return {
    id: m.id,
    status: played ? 'played' : 'scheduled',
    teamA: m.teamA,
    teamB: m.teamB,
    score: played ? [m.scoreA ?? 0, m.scoreB ?? 0] : null,
    winner: m.winner?.tag ?? null,
    playedAt: m.playedAt,
  };
}

export const matches = {
  async findView(id: number): Promise<MatchView | null> {
    const row = await prisma.match.findUnique({ where: { id }, include });
    return row ? toView(row) : null;
  },

  async findByStatus(status?: MatchStatus): Promise<MatchView[]> {
    const where = status === 'played' ? { playedAt: { not: null } } : status === 'scheduled' ? { playedAt: null } : undefined;
    const rows = await prisma.match.findMany({ where, include, orderBy: { id: 'asc' } });
    return rows.map(toView);
  },

  insert(data: MatchInput): Promise<{ id: number }> {
    return prisma.match.create({ data, select: { id: true } });
  },

  /** Enregistre le résultat d'un match pas encore joué ; false s'il l'était déjà. updateMany = UPDATE … WHERE. */
  async recordResult(id: number, result: MatchResult): Promise<boolean> {
    const winnerId = result.winner === result.teamA.tag ? result.teamA.id : result.teamB.id;
    const { count } = await prisma.match.updateMany({
      where: { id, playedAt: null },
      data: { scoreA: result.score[0], scoreB: result.score[1], winnerId, playedAt: new Date() },
    });
    return count > 0;
  },

  async delete(id: number): Promise<boolean> {
    const { count } = await prisma.match.deleteMany({ where: { id } });
    return count > 0;
  },
};
