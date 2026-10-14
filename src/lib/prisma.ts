import { PrismaClient } from '@prisma/client'

/**
 * The password hash is never loaded unless a query asks for it with `select: {
 * password: true }` (the credentials login and the GitHub-disconnect check). Queries that don't use
 * the user row should also `select` a few columns: a full row carries the
 * banner image (base64) and every JSON column, and an `update` returns it too.
 */
const createClient = () => new PrismaClient({ omit: { user: { password: true } } })

const globalForPrisma = global as unknown as { prisma: ReturnType<typeof createClient> }

export const prisma =
  globalForPrisma.prisma ||
  createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
