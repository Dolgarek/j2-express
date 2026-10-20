// Les routes de l'authentification : s'inscrire, se connecter, savoir qui je suis.
import { Router } from 'express';
import { HttpError } from '../errors.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { validate } from '../middlewares/validate.js';
import { generateRefreshToken, hashPassword, hashRefreshToken, signAccessToken, verifyPassword, type AuthUser } from './auth.service.js';
import { refreshTokens } from './refresh-token.repository.js';
import { users } from './user.repository.js';
import { LoginSchema, RefreshSchema, RegisterSchema, toPublic, type Credentials, type RefreshInput } from './user.schema.js';

export const authRouter = Router();

// POST /api/auth/register { email, password } → 201 l'utilisateur créé (sans son mot de passe)
authRouter.post('/register', validate(RegisterSchema), async (req, res) => {
  const { email, password } = req.body as Credentials;
  const user = await users.insert({ email, password: await hashPassword(password) });
  res.status(201).json(toPublic(user));
});

// POST /api/auth/login { email, password } → 200 { accessToken, tokenType: 'Bearer', expiresIn }
// Email inconnu ou mot de passe faux → le MÊME 401 'Invalid credentials' (on ne dit pas lequel).
authRouter.post('/login', validate(LoginSchema), async (req, res) => {
  const { email, password } = req.body as Credentials;
  const user = await users.findByEmail(email);
  if (!user || !(await verifyPassword(password, user.password))) throw new HttpError(401, 'Invalid credentials');
  res.json(await issueTokens({ id: user.id, email: user.email }));
});

/** Bonus 13 : un jeton d'accès (court, stateless) + un refresh token (long, révocable, stocké haché). */
async function issueTokens(user: AuthUser) {
  const refresh = generateRefreshToken();
  await refreshTokens.insert(refresh.hash, user.id);
  return { ...signAccessToken(user), tokenType: 'Bearer', refreshToken: refresh.token };
}

// POST /api/auth/refresh { refreshToken } → 200 un NOUVEAU couple (l'ancien refresh token est consommé)
authRouter.post('/refresh', validate(RefreshSchema), async (req, res) => {
  const { refreshToken } = req.body as RefreshInput;
  const userId = await refreshTokens.consume(hashRefreshToken(refreshToken));
  const user = userId === null ? null : await users.findOne(userId);
  if (!user) throw new HttpError(401, 'Invalid refresh token');
  res.json(await issueTokens({ id: user.id, email: user.email }));
});

// POST /api/auth/logout { refreshToken } → 204 : le refresh token est révoqué (le jeton d'accès, lui, expire seul)
authRouter.post('/logout', validate(RefreshSchema), async (req, res) => {
  const { refreshToken } = req.body as RefreshInput;
  await refreshTokens.consume(hashRefreshToken(refreshToken));
  res.sendStatus(204);
});

// GET /api/auth/me (protégée) → 200 { id, email } : l'utilisateur du jeton
authRouter.get('/me', requireAuth, async (_req, res) => {
  res.json(res.locals.user as AuthUser);
});
