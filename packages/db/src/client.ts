import { PrismaClient } from '@prisma/client';

const g = globalThis as unknown as { __egoPrisma?: PrismaClient };

/** Cliente único (o Next.js recarrega módulos em desenvolvimento). */
export const prisma: PrismaClient = g.__egoPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') g.__egoPrisma = prisma;

export type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;
