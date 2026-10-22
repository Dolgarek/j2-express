# J2 · TD Redis étape 2 — `cached(ttl)` : deux façons d'écrire la même chose

> Correction commentée, à présenter après l'étape 2. Les deux versions font passer `21-cache-middleware.hurl`.
> La question qu'elles répondent : **comment un morceau de code posé AVANT la route peut-il stocker ce que la
> route envoie APRÈS ?**

## Le problème

Un middleware Express est une fonction `(req, res, next)`. Quand il appelle `next()`, la main passe à la route,
et il ne reprend jamais la parole. Or le cache a besoin du corps de la réponse, que seule la route connaît.

Express n'offre **aucun événement qui expose ce corps** : `res.on('finish')` se déclenche une fois la réponse
partie, le corps n'est plus accessible. Il reste deux stratégies :

1. **intercepter** `res.json` : on remplace la fonction par la nôtre, qui stocke puis appelle l'originale ;
2. **inverser le contrôle** : ce n'est plus la route qui envoie, c'est le wrapper, et la route lui *renvoie* le corps.

## Version 1 · le middleware qui intercepte `res.json` (le corrigé)

```ts
// src/cache.ts
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
```

```ts
// src/players/player.router.ts : la route ne sait pas qu'elle est cachée
playerRouter.get('/top', validateQuery(TopQuerySchema), cached(60), async (_req, res) => {
  res.json(await players.findTop(res.locals.query as TopQuery));
});
```

Chaque ligne du bloc MISS a une raison d'être :

| Ligne | Pourquoi |
|---|---|
| `res.json.bind(res)` | `res.json` utilise `this` en interne. Sans `bind`, l'originale est appelée avec `this === undefined` : plantage. |
| `if (res.statusCode === 200)` | Le `errorHandler` et `notFound` passent **aussi** par `res.json`. Sans ce test, un 404 serait mis en cache 60 s. |
| `.catch(() => undefined)` sans `await` | Règle d'or : Redis en panne ne casse pas l'API. Et la réponse part sans attendre l'écriture. |
| `return originalJson(body)` | On rend la main à Express : c'est lui qui sérialise, pose `Content-Type` et envoie. |

C'est le pattern des bibliothèques du marché (`apicache`, `express-redis-cache`…) : un middleware « en sandwich »,
qui agit avant **et** après la route. Son prix : on modifie un objet qu'on ne possède pas (`res`), et il faut
connaître `bind` et `statusCode` pour que ça tienne.

## Version 2 · le wrapper de handler (la variante)

```ts
// src/cache.ts
export function cached<T>(
  ttlSeconds: number,
  handler: (req: Request, res: Response) => Promise<T>,
): RequestHandler {
  return async (req, res) => {
    const key = cacheKey(req);

    // HIT ?
    const hit = await redis.get(key).catch(() => null);
    if (hit !== null) {
      res.set('X-Cache', 'HIT').type('json').send(hit);
      return;
    }

    // MISS : c'est NOUS qui répondons, avec ce que la route nous renvoie
    const body = await handler(req, res); // un 404 → throw HttpError → on ne passe jamais à la ligne suivante
    redis.set(key, JSON.stringify(body), { EX: ttlSeconds }).catch(() => undefined); // sans attendre
    res.set('X-Cache', 'MISS').json(body);
  };
}
```

```ts
// src/players/player.router.ts : la route RENVOIE son résultat au lieu de l'envoyer
playerRouter.get('/top', validateQuery(TopQuerySchema), cached(60, async (_req, res) => {
  return players.findTop(res.locals.query as TopQuery);
}));
```

Ce qui disparaît : le `bind`, le remplacement de `res.json`, le test du statut (un 404 est une exception, elle saute
la mise en cache toute seule), le `next()`. Ce qui apparaît : la route change de contrat. Elle ne répond plus, elle
**retourne** une valeur, et quelqu'un d'autre décide comment l'envoyer. Les trois routes cachées s'écrivent donc
autrement que toutes les autres routes du projet.

## Face à face

| | Version 1 · middleware | Version 2 · wrapper |
|---|---|---|
| Forme | `cached(60)` posé dans la chaîne, comme `validateQuery` | `cached(60, handler)` qui *enveloppe* la route |
| La route | inchangée : `res.json(...)` | renvoie le corps : `return ...` |
| Mécanisme | remplace `res.json` le temps d'une requête | appelle la route comme une fonction ordinaire |
| « Jamais un 404 en cache » | test explicite sur `res.statusCode` | gratuit : le `throw` court-circuite |
| Pièges | `bind` oublié, statut non testé | une route qui fait `res.json` au lieu de `return` répond deux fois |
| Idiome | celui des bibliothèques Express | celui des frameworks qui retournent la réponse (NestJS, Fastify, Symfony) |
| Tests Hurl | ✅ | ✅ |

## Ce qu'il faut retenir

Les deux versions sont correctes et de taille comparable. Le choix est une question de **contrat** :

- la version 1 garde le contrat Express pur, « la route répond », et paie ce choix par un peu de plomberie ;
- la version 2 change le contrat, « la route renvoie », et la plomberie disparaît.

Vous retrouverez la seconde forme dès que vous toucherez à NestJS ou Fastify (ou Symfony, que vous avez vu au J0 :
un contrôleur *retourne* une `Response`). Le corrigé garde la première parce que c'est l'occasion unique de la
journée de voir un middleware agir **après** la route, et parce qu'elle ne touche pas aux routes existantes.
