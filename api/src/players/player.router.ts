// Les routes de Player. Hier : PlayerController + le DTO PlayerInput.
import { Router } from 'express';
import { cached, invalidate } from '../cache.js';
import { HttpError } from '../errors.js';
import { parseId } from '../middlewares/params.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { validate, validateQuery } from '../middlewares/validate.js';
import { players } from './player.repository.js';
import { PlayerPatchSchema, PlayerSchema, PlayerSearchSchema, TopQuerySchema, type PlayerInput, type PlayerSearch, type TopQuery } from './player.schema.js';

export const playerRouter = Router();

// Étape 3 du TD Redis : un joueur qui change, c'est le classement (/players/top) ET le niveau moyen de son
// équipe (/teams/:id/versus) qui changent → on vide les deux familles de clés.
async function invalidateAfterPlayerWrite(): Promise<void> {
  await invalidate('/api/players');
  await invalidate('/api/teams');
}

// GET /api/players?page=&limit=&country=&teamId=&q= : une page, le total dans un en-tête
playerRouter.get('/', validateQuery(PlayerSearchSchema), async (_req, res) => {
  const { items, total } = await players.search(res.locals.query as PlayerSearch);
  res.set('X-Total-Count', String(total)).json(items);
});

// GET /api/players/top?limit=3&country=IS — déclarée AVANT /:id, sinon « top » est pris pour un id
// Mis en cache 60 s (cached APRÈS validateQuery : une query invalide → 400 sans toucher Redis)
playerRouter.get('/top', validateQuery(TopQuerySchema), cached(60), async (_req, res) => {
  res.json(await players.findTop(res.locals.query as TopQuery));
});

// GET /api/players/:id
playerRouter.get('/:id', async (req, res) => {
  const player = await players.findView(parseId(req.params.id, 'Player'));
  if (!player) throw new HttpError(404, 'Player not found');
  res.json(player);
});

// POST /api/players : on insère la ligne, puis on relit la vue (avec l'équipe imbriquée)
playerRouter.post('/', requireAuth, validate(PlayerSchema), async (req, res) => {
  const { id } = await players.insert(req.body as PlayerInput);
  await invalidateAfterPlayerWrite();
  res.status(201).location(`/api/players/${id}`).json(await players.findView(id));
});

// PATCH /api/players/:id
playerRouter.patch('/:id', requireAuth, validate(PlayerPatchSchema), async (req, res) => {
  const id = parseId(req.params.id, 'Player');
  const updated = await players.update(id, req.body as Partial<PlayerInput>);
  if (!updated) throw new HttpError(404, 'Player not found');
  await invalidateAfterPlayerWrite();
  res.json(await players.findView(id));
});

// DELETE /api/players/:id
playerRouter.delete('/:id', requireAuth, async (req, res) => {
  const deleted = await players.delete(parseId(req.params.id, 'Player'));
  if (!deleted) throw new HttpError(404, 'Player not found');
  await invalidateAfterPlayerWrite();
  res.sendStatus(204);
});
