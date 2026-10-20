// Le cache Redis : un client pour tout le projet, et trois outils que vous écrivez cet après-midi.
//   cacheKey(req)        la clé Redis d'une requête GET : « cache:/api/players/top?limit=3 »
//   cached(ttlSeconds)   un middleware : HIT → la réponse stockée ; MISS → la route répond, on stocke
//   invalidate(prefix)   supprime les clés « cache:<prefix>* » après une écriture
// Règle d'or : Redis en panne ne doit JAMAIS faire tomber l'API. Un cache qui échoue = pas de cache.
import type { Request, RequestHandler } from 'express';
import { createClient } from 'redis';

export const redis = createClient({
  url: process.env.REDIS_URL,
  // Sans cette option, une commande envoyée pendant une coupure attend la reconnexion… indéfiniment.
  // Avec : elle échoue tout de suite, et le code appelant décide (ici : on fait sans cache).
  disableOfflineQueue: true,
});

// Sans écouteur « error », une coupure Redis lèverait une exception non rattrapée : Node s'arrêterait.
redis.on('error', (err: Error) => console.error(`Redis : ${err.message}`));

/**
 * Appelé au démarrage (server.ts), SANS await : la connexion se fait en arrière-plan et node-redis réessaie tout
 * seul tant que Redis ne répond pas. L'API écoute tout de suite ; tant que Redis n'est pas là, chaque commande
 * échoue immédiatement (disableOfflineQueue) et le code appelant fait sans cache.
 */
export function connectRedis(): void {
  redis
    .connect()
    .then(() => console.log('Redis connecté'))
    .catch((err: Error) => console.error(`Redis : ${err.message}`));
}

/**
 * TODO 21 (TD Redis, étape 2) : la clé d'une requête GET. Le chemin ET la query en font partie
 * (?limit=3 et ?limit=2 ne sont pas la même réponse), la query triée par nom de paramètre
 * (?country=IS&limit=3 et ?limit=3&country=IS sont la même réponse). Préfixe : « cache: ».
 */
export function cacheKey(req: Request): string {
  const query = new URLSearchParams(req.query as Record<string, string>);
  query.sort(); // ?limit=3&country=IS et ?country=IS&limit=3 → la même clé
  const suffix = query.size ? `?${query.toString()}` : '';
  return `cache:${req.path === '/' ? req.baseUrl : req.baseUrl + req.path}${suffix}`;
}

/**
 * TODO 21 (TD Redis, étape 2) : le middleware de cache, à poser sur une route GET,
 * APRÈS validateQuery (une query invalide → 400, sans passer par ici).
 *   HIT  : la valeur stockée est renvoyée telle quelle, en-tête X-Cache: HIT, la route n'est pas appelée
 *   MISS : en-tête X-Cache: MISS, on laisse la route répondre, et on stocke SA réponse si elle est un 200
 *          (jamais un 404 ou une erreur), avec une durée de vie (EX ttlSeconds)
 * Pour intercepter la réponse : remplacer res.json par une fonction qui stocke puis appelle l'original.
 * Si Redis échoue (get ou set) : next(), sans cache, sans erreur.
 */
export function cached(ttlSeconds: number): RequestHandler {
  return async (req, res, next) => {
    const key = cacheKey(req);

    // HIT ?
    const hit = await redis.get(key).catch(() => null);
    if (hit !== null) {
      res.set('X-Cache', 'HIT').type('json').send(hit);
      return;
    }

    // MISS : on laisse la route répondre, mais on intercepte res.json pour stocker ce qu'elle envoie
    res.set('X-Cache', 'MISS');
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode === 200) {
        redis.set(key, JSON.stringify(body), { EX: ttlSeconds }).catch(() => undefined); // sans attendre
      }
      return originalJson(body);
    };
    next();
  };
}

/**
 * TODO 22 (TD Redis, étape 3) : supprimer toutes les clés « cache:<prefix>* », par exemple
 * invalidate('/api/players') après une écriture sur un joueur. Avec SCAN (redis.scanIterator), pas KEYS :
 * KEYS bloque le serveur le temps de parcourir TOUTES les clés. Une erreur Redis est avalée (log).
 */
export async function invalidate(prefix: string): Promise<void> {
  try {
    // scanIterator parcourt les clés par paquets, sans bloquer Redis ; MATCH filtre côté serveur
    for await (const keys of redis.scanIterator({ MATCH: `cache:${prefix}*`, COUNT: 100 })) {
      if (keys.length) await redis.del(keys);
    }
  } catch (err) {
    console.error(`Redis : invalidation impossible (${(err as Error).message})`);
  }
}

/**
 * TODO 23 (TD Redis, étape 4) : 'ok' si Redis répond à PING, 'down' sinon (pour /api/health).
 */
export async function redisStatus(): Promise<'ok' | 'down'> {
  return 'down';
}
