// Bonus 25 : les refresh tokens dans Redis plutôt qu'en base. Une clé « refresh:<sha256> » → id utilisateur,
// avec une durée de vie (EX) : plus de colonne expires_at, plus de nettoyage, Redis oublie tout seul.
// Même interface que la version PostgreSQL du bonus 13 : le routeur ne change pas.
import { redis } from '../cache.js';
import { REFRESH_TTL_SECONDS } from './auth.service.js';

const key = (hash: string) => `refresh:${hash}`;

export const refreshTokens = {
  /** Enregistre un hachage pour cet utilisateur, valable REFRESH_TTL_SECONDS. */
  async insert(hash: string, userId: number): Promise<void> {
    await redis.set(key(hash), String(userId), { EX: REFRESH_TTL_SECONDS });
  },

  /** Consomme le jeton : renvoie l'id de l'utilisateur si la clé existe (donc non expirée), et la supprime (rotation).
   *  GETDEL lit et supprime en une seule commande atomique : deux appels simultanés ne peuvent pas la consommer deux fois. */
  async consume(hash: string): Promise<number | null> {
    const userId = await redis.getDel(key(hash));
    return userId === null ? null : Number(userId);
  },
};
