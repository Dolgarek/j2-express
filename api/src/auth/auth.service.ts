// Les deux savoir-faire du matin, sans Express ni SQL : hacher un mot de passe (bcrypt) et
// signer / vérifier un jeton (JWT). Le routeur et le middleware appellent ces fonctions.
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { HttpError } from '../errors.js';

// Le secret vient de l'environnement (compose.yaml) : jamais en dur dans le code, jamais dans Git.
// Et pas de valeur de repli : une API qui signe avec un secret deviné vaut moins qu'une API qui refuse de démarrer.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant : définissez-le dans compose.yaml`);
  return value;
}
const JWT_SECRET = requireEnv('JWT_SECRET');
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN ?? '1h') as jwt.SignOptions['expiresIn'];

/** Ce qu'on sait d'un utilisateur connecté, lu dans son jeton (pas dans la base). */
export interface AuthUser {
  id: number;
  email: string;
}

// ── bcrypt ─────────────────────────────────────────────────────────────────

/**
 * TODO 1 (TD JWT, étape 1) : renvoyer le hachage bcrypt du mot de passe (coût 10).
 * Pour l'instant, le mot de passe est stocké EN CLAIR : c'est le bug que vous corrigez en premier.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10); // 10 « rounds » : ~100 ms par hachage, volontairement lent
}

/**
 * TODO 1 (TD JWT, étape 1) : true si `password` correspond au hachage `hash`.
 * On ne « déchiffre » jamais un hachage : on hache le candidat et on compare (bcrypt.compare le fait).
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── JWT ────────────────────────────────────────────────────────────────────

/**
 * TODO 2 (TD JWT, étape 2) : signer un jeton d'accès pour cet utilisateur.
 * Payload : { sub: l'id en chaîne, email } ; secret : process.env.JWT_SECRET ;
 * durée : process.env.JWT_EXPIRES_IN ('1h' par défaut). expiresIn est renvoyé en secondes.
 */
export function signAccessToken(user: AuthUser): { accessToken: string; expiresIn: number } {
  // sub (« subject ») est la claim standard pour l'identifiant : une chaîne, par convention
  const accessToken = jwt.sign({ sub: String(user.id), email: user.email }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: JWT_EXPIRES_IN,
  });
  // jwt.sign a calculé iat (émis à) et exp (expire à), en secondes : on les relit pour renvoyer la durée
  const { iat = 0, exp = 0 } = jwt.decode(accessToken) as jwt.JwtPayload;
  return { accessToken, expiresIn: exp - iat };
}

/**
 * TODO 2 (TD JWT, étape 3) : vérifier la signature et la date d'expiration, et
 * reconstruire l'AuthUser depuis le payload. Un jeton expiré → HttpError(401, 'Token expired') ;
 * tout autre problème (signature, format) → HttpError(401, 'Invalid token').
 */
export function verifyAccessToken(token: string): AuthUser {
  let payload: jwt.JwtPayload;
  try {
    // verify = vérifier la signature (avec NOTRE secret) ET la date d'expiration, puis décoder
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new HttpError(401, 'Token expired');
    throw new HttpError(401, 'Invalid token'); // JsonWebTokenError : signature, format, algorithme…
  }
  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') throw new HttpError(401, 'Invalid token');
  return { id: Number(payload.sub), email: payload.email };
}

// ── Refresh token (bonus 13) ───────────────────────────────────────────────

export const REFRESH_TTL_SECONDS = 7 * 24 * 3600; // 7 jours

/** sha256 hexadécimal : ce qu'on STOCKE (le jeton lui-même ne quitte jamais le client, sauf pour être présenté). */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Un jeton opaque de 64 caractères hexadécimaux (32 octets aléatoires), et son hachage. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashRefreshToken(token) };
}
