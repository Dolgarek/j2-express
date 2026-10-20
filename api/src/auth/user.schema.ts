// Les types et les schémas de validation de User. Même découpage qu'hier (schema / repository / router) :
// ce fichier décrit les données, il ne connaît ni Express ni SQL. Vous n'avez rien à y changer ce matin.
import { z } from 'zod';

/** Une ligne de la table "user". `password` contient le HACHAGE bcrypt, jamais le mot de passe. */
export interface User {
  id: number;
  email: string;
  password: string;
  createdAt: Date;
}

/** Ce que l'API renvoie : un utilisateur SANS son mot de passe (ni haché, ni en clair). */
export type PublicUser = Omit<User, 'password'>;

export function toPublic(user: User): PublicUser {
  const { password: _password, ...publicUser } = user;
  return publicUser;
}

// POST /api/auth/register et /login : un email (normalisé en minuscules) et un mot de passe de 8 à 72 caractères
// (72 : la limite de bcrypt, au-delà les caractères sont ignorés).
export const RegisterSchema = z.object({
  email: z.string().trim().toLowerCase().max(255).pipe(z.email()),
  password: z.string().min(8).max(72),
});
export const LoginSchema = RegisterSchema; // mêmes champs, mêmes règles
export type Credentials = z.infer<typeof RegisterSchema>;

// Bonus 13 : POST /api/auth/refresh et /logout { refreshToken }
export const RefreshSchema = z.object({
  refreshToken: z.string().regex(/^[0-9a-f]{64}$/, 'must be a 64-character hexadecimal token'),
});
export type RefreshInput = z.infer<typeof RefreshSchema>;
