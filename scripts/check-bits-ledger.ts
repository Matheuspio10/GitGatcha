/**
 * Read-only check of the BITS history: for every player, the sum of their
 * BitsTransaction rows must equal their balance. Prints the mismatches.
 *
 *   node --env-file=.env.prod --import tsx scripts/check-bits-ledger.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw<{ username: string | null; currency: number; sum: number; n: number }[]>`
    SELECT u."username", u."currency", COALESCE(SUM(t."amount"), 0)::int AS sum, COUNT(t.*)::int AS n
    FROM "User" u LEFT JOIN "BitsTransaction" t ON t."userId" = u."id"
    GROUP BY u."id"
  `;
  const mismatches = rows.filter(r => r.sum !== r.currency);
  console.log(`${rows.length} players, ${rows.reduce((s, r) => s + r.n, 0)} history rows, ${mismatches.length} mismatches`);
  for (const r of mismatches) console.log(`  ${r.username ?? '(no username)'}: balance ${r.currency}, history ${r.sum}`);
  if (mismatches.length > 0) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
