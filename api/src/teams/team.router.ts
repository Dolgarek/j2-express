// Les routes de Team. Hier : TeamController.
import { Router } from 'express';
import { cached } from '../cache.js';
import { HttpError } from '../errors.js';
import { SeedQuerySchema, type SeedQuery } from '../matches/match.schema.js';
import { simulate } from '../matches/simulator.js';
import { parseId } from '../middlewares/params.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { validate, validateQuery } from '../middlewares/validate.js';
import { teams } from './team.repository.js';
import { TeamPatchSchema, TeamQuerySchema, TeamSchema, type TeamInput, type TeamQuery } from './team.schema.js';

export const teamRouter = Router();

// GET /api/teams[?country=FR] — mis en cache 30 s
teamRouter.get('/', validateQuery(TeamQuerySchema), cached(30), async (_req, res) => {
  const { country } = res.locals.query as TeamQuery;
  res.json(await teams.findByCountry(country));
});

// GET /api/teams/:id
teamRouter.get('/:id', async (req, res) => {
  const team = await teams.findOneWithPlayers(parseId(req.params.id, 'Team'));
  if (!team) throw new HttpError(404, 'Team not found');
  res.json(team);
});

// GET /api/teams/:id/versus/:opponentId[?seed=42] : un match simulé, rien n'est enregistré
// Mis en cache 60 s : deux lectures de niveau moyen + une simulation à chaque appel, pour un résultat stable
teamRouter.get('/:id/versus/:opponentId', validateQuery(SeedQuerySchema), cached(60), async (req, res) => {
  const id = parseId(req.params.id, 'Team');
  const opponentId = parseId(req.params.opponentId, 'Team');
  const { seed } = res.locals.query as SeedQuery;

  const [team, opponent] = await Promise.all([teams.findOne(id), teams.findOne(opponentId)]);
  if (!team || !opponent) throw new HttpError(404, 'Team not found');
  if (id === opponentId) throw new HttpError(422, 'Validation Failed', [{ path: 'opponentId', message: 'a team cannot play against itself' }]);

  const [rating, opponentRating] = await Promise.all([teams.ratingOf(id), teams.ratingOf(opponentId)]);
  if (rating === null) throw new HttpError(422, 'Validation Failed', [{ path: 'id', message: 'team has no players' }]);
  if (opponentRating === null) throw new HttpError(422, 'Validation Failed', [{ path: 'opponentId', message: 'team has no players' }]);

  res.json(simulate({ ...team, rating }, { ...opponent, rating: opponentRating }, seed));
});

// POST /api/teams
teamRouter.post('/', requireAuth, validate(TeamSchema), async (req, res) => {
  const team = await teams.insert(req.body as TeamInput);
  res.status(201).location(`/api/teams/${team.id}`).json(team);
});

// PATCH /api/teams/:id
teamRouter.patch('/:id', requireAuth, validate(TeamPatchSchema), async (req, res) => {
  const team = await teams.update(parseId(req.params.id, 'Team'), req.body as Partial<TeamInput>);
  if (!team) throw new HttpError(404, 'Team not found');
  res.json(team);
});

// DELETE /api/teams/:id (ses joueurs deviennent agents libres : ON DELETE SET NULL)
teamRouter.delete('/:id', requireAuth, async (req, res) => {
  const deleted = await teams.delete(parseId(req.params.id, 'Team'));
  if (!deleted) throw new HttpError(404, 'Team not found');
  res.sendStatus(204);
});
