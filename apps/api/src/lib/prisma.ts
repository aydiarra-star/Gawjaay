import { PrismaClient } from '@prisma/client';

/**
 * Instance Prisma unique (singleton) partagée par l'application.
 */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export type Db = PrismaClient;

/** Client transactionnel (sous-ensemble passé aux fonctions métier). */
export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
