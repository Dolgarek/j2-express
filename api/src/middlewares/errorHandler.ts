// LE middleware d'erreur : 4 paramètres, enregistré en dernier. Toutes les erreurs (next(err), exception
// dans un handler async, erreur de express.json(), erreur Prisma) finissent ici, en JSON cohérent.
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { translatePrismaError } from '../prisma.js';
import { HttpError } from '../errors.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let error: HttpError;
  if (err instanceof HttpError) {
    error = err;
  } else if (err instanceof ZodError) {
    // un schema.parse() hors middleware : filet de sécurité
    error = new HttpError(422, 'Validation Failed', err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  } else if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
    error = new HttpError(400, 'Bad Request'); // JSON illisible, levé par express.json()
  } else {
    error = translatePrismaError(err) ?? new HttpError(500, 'Internal Server Error');
  }

  if (error.status === 500) console.error(err); // le détail reste côté serveur, jamais chez le client
  // Un 401 dit au client comment s'authentifier (RFC 7235) : ici, un jeton Bearer
  if (error.status === 401) res.set('WWW-Authenticate', 'Bearer');

  res.status(error.status).json({
    title: error.message,
    status: error.status,
    ...(error.errors ? { errors: error.errors } : {}),
  });
};
