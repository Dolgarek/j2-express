// Bonus 13 : les refresh tokens, en base. Une ligne = une session ouverte ; la supprimer = la révoquer.
import { query } from '../db.js';
import { REFRESH_TTL_SECONDS } from './auth.service.js';

export const refreshTokens = {
  /** Enregistre un hachage pour cet utilisateur, valable REFRESH_TTL_SECONDS. */
  async insert(hash: string, userId: number): Promise<void> {
    await query(
      `INSERT INTO refresh_token (token_hash, user_id, expires_at) VALUES ($1, $2, now() + ($3 || ' seconds')::interval)`,
      [hash, userId, String(REFRESH_TTL_SECONDS)],
    );
  },

  /** Consomme le jeton : renvoie l'id de l'utilisateur si le hachage existe et n'est pas expiré, et le supprime (rotation). */
  async consume(hash: string): Promise<number | null> {
    const [row] = await query<{ userId: number }>(
      `DELETE FROM refresh_token WHERE token_hash = $1 AND expires_at > now() RETURNING user_id AS "userId"`,
      [hash],
    );
    return row?.userId ?? null;
  },
};
