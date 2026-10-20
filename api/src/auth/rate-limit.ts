// Bonus 24 : limiter les tentatives de connexion, avec Redis (INCR + EXPIRE, fenêtre fixe d'une minute).
// Clé par couple (adresse IP, email) : un attaquant qui essaie des mots de passe sur UN compte est freiné,
// sans bloquer tous les utilisateurs derrière la même IP (un lycée, une entreprise…).
import type { RequestHandler } from 'express';
import { redis } from '../cache.js';
import type { Credentials } from './user.schema.js';

const WINDOW_SECONDS = 60;
const MAX_ATTEMPTS = 5;

/** À poser APRÈS validate(LoginSchema) : l'email est alors propre (minuscules). */
export const rateLimitLogin: RequestHandler = async (req, res, next) => {
  const { email } = req.body as Credentials;
  const key = `ratelimit:login:${req.ip}:${email}`;
  try {
    const attempts = await redis.incr(key);
    if (attempts === 1) await redis.expire(key, WINDOW_SECONDS); // la fenêtre démarre à la 1re tentative
    if (attempts > MAX_ATTEMPTS) {
      const ttl = await redis.ttl(key);
      res.set('Retry-After', String(Math.max(ttl, 1))).status(429).json({ title: 'Too Many Requests', status: 429 });
      return;
    }
  } catch (err) {
    console.error(`Redis : rate limiting désactivé (${(err as Error).message})`); // Redis en panne : on laisse passer
  }
  next();
};
