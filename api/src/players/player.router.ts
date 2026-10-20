// Les routes de Player. Hier : PlayerController + le DTO PlayerInput.
import { Router } from 'express';
import { redis } from '../cache.js';
import { HttpError } from '../errors.js';
import { parseId } from '../middlewares/params.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { validate, validateQuery } from '../middlewares/validate.js';
import { players } from './player.repository.js';
import { PlayerPatchSchema, PlayerSchema, PlayerSearchSchema, TopQuerySchema, type PlayerInput, type PlayerSearch, type TopQuery } from './player.schema.js';

export const playerRouter = Router();

// GET /api/players?page=&limit=&country=&teamId=&q= : une page, le total dans un en-tête
playerRouter.get('/', validateQuery(PlayerSearchSchema), async (_req, res) => {
  const { items, total } = await players.search(res.locals.query as PlayerSearch);
  res.set('X-Total-Count', String(total)).json(items);
});

// GET /api/players/top?limit=3&country=IS — déclarée AVANT /:id, sinon « top » est pris pour un id
// Étape 1 du TD Redis : un cache à la main, ici même (généralisé en middleware à l'étape 2).
playerRouter.get('/top', validateQuery(TopQuerySchema), async (req, res) => {
  const key = `cache:${req.originalUrl}`; // le chemin ET la query : ?limit=3 n'est pas ?limit=2

  // 1. Le cache a-t-il déjà la réponse ? (une panne Redis → on fait comme si non)
  const hit = await redis.get(key).catch(() => null);
  if (hit !== null) {
    res.set('X-Cache', 'HIT').type('json').send(hit); // déjà du JSON : on l'envoie tel quel
    return;
  }

  // 2. Non : on interroge la base, on répond, et on garde la réponse 60 secondes
  const top = await players.findTop(res.locals.query as TopQuery);
  await redis.set(key, JSON.stringify(top), { EX: 60 }).catch(() => undefined);
  res.set('X-Cache', 'MISS').json(top);
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
  res.status(201).location(`/api/players/${id}`).json(await players.findView(id));
});

// PATCH /api/players/:id
playerRouter.patch('/:id', requireAuth, validate(PlayerPatchSchema), async (req, res) => {
  const id = parseId(req.params.id, 'Player');
  const updated = await players.update(id, req.body as Partial<PlayerInput>);
  if (!updated) throw new HttpError(404, 'Player not found');
  res.json(await players.findView(id));
});

// DELETE /api/players/:id
playerRouter.delete('/:id', requireAuth, async (req, res) => {
  const deleted = await players.delete(parseId(req.params.id, 'Player'));
  if (!deleted) throw new HttpError(404, 'Player not found');
  res.sendStatus(204);
});
