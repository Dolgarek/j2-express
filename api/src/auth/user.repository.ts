// L'accès à la table "user", avec Prisma (le @@map("user") du schéma gère les guillemets pour nous).
import { prisma } from '../prisma.js';
import type { Credentials, User } from './user.schema.js';

export const users = {
  findOne(id: number): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  },

  insert(data: Credentials): Promise<User> {
    return prisma.user.create({ data });
  },
};
