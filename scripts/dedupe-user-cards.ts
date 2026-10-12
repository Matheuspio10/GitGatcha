/**
 * Merges duplicate UserCard rows (same player + same card) into one, before the
 * @@unique([userId, cardId]) constraint goes in.
 *
 *   node --env-file=.env.prod --import tsx scripts/dedupe-user-cards.ts           # dry run
 *   node --env-file=.env.prod --import tsx scripts/dedupe-user-cards.ts --apply   # write
 *
 * Keeper: Signature > Shiny > most loyalty > oldest. Loyalty and lifetime stats are
 * summed into it, Shiny/Signature/active-team flags carry over. Every extra copy is
 * paid out as duplicate fragments (what pulling a duplicate gives today), so nobody loses value.
 */
import { Prisma, PrismaClient } from '@prisma/client';

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();

// Same table as boosterService (duplicate pull → fragments of the card's language)
const FRAGMENTS_PER_RARITY: Record<string, number> = { Common: 5, Uncommon: 10, Rare: 20, Epic: 40, Legendary: 80 };

type Row = Prisma.UserCardGetPayload<{ include: { card: true } }>;

function rank(r: Row) {
  return [r.edition === 'signature' ? 1 : 0, r.isShiny ? 1 : 0, r.loyaltyCount, -r.createdAt.getTime()];
}

function better(a: Row, b: Row) {
  const ra = rank(a), rb = rank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] > rb[i] ? a : b;
  return a;
}

function sumStats(rows: Row[]): Prisma.InputJsonValue {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const stats = (r.lifetimeStats && typeof r.lifetimeStats === 'object' && !Array.isArray(r.lifetimeStats) ? r.lifetimeStats : {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(stats)) if (typeof v === 'number') out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

function unionMilestones(rows: Row[]): Prisma.InputJsonValue {
  const seen = new Map<string, unknown>();
  for (const r of rows) for (const m of Array.isArray(r.loyaltyMilestones) ? r.loyaltyMilestones : []) seen.set(JSON.stringify(m), m);
  return [...seen.values()] as Prisma.InputJsonValue;
}

async function main() {
  const groups = await prisma.$queryRaw<{ userId: string; cardId: string }[]>`
    SELECT "userId", "cardId" FROM "UserCard" GROUP BY 1, 2 HAVING COUNT(*) > 1`;
  console.log(`${groups.length} duplicate groups — ${apply ? 'APPLYING' : 'dry run'}\n`);

  for (const g of groups) {
    const rows = await prisma.userCard.findMany({ where: { userId: g.userId, cardId: g.cardId }, include: { card: true } });
    const keeper = rows.reduce(better);
    const extras = rows.filter(r => r.id !== keeper.id);
    const lang = keeper.card.primaryLanguage || 'Unknown';
    const fragments = lang === 'Unknown' ? 0 : extras.length * (FRAGMENTS_PER_RARITY[keeper.card.rarity] ?? 5);
    console.log(`  ${keeper.card.githubUsername.padEnd(18)} user ${g.userId.slice(0, 8)}: keep 1 of ${rows.length}${keeper.isShiny ? ' (shiny)' : ''}, +${fragments} ${lang} fragments`);
    if (!apply) continue;

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${g.userId} FOR UPDATE`;
      await tx.userCard.update({
        where: { id: keeper.id },
        data: {
          isShiny: rows.some(r => r.isShiny),
          edition: rows.some(r => r.edition === 'signature') ? 'signature' : keeper.edition,
          loyaltyCount: rows.reduce((s, r) => s + r.loyaltyCount, 0),
          loyaltyMilestones: unionMilestones(rows),
          lifetimeStats: sumStats(rows),
          stamina: Math.max(...rows.map(r => r.stamina)),
          inActiveTeam: rows.some(r => r.inActiveTeam),
          showcaseOrder: rows.map(r => r.showcaseOrder).filter((o): o is number => o !== null).sort((a, b) => a - b)[0] ?? null,
        },
      });
      await tx.userCard.deleteMany({ where: { id: { in: extras.map(r => r.id) } } });
      if (fragments > 0) {
        const user = await tx.user.findUniqueOrThrow({ where: { id: g.userId }, select: { fragments: true, fragmentLogs: true } });
        const balance = { ...((user.fragments ?? {}) as Record<string, number>) };
        balance[lang] = (balance[lang] ?? 0) + fragments;
        const logs = Array.isArray(user.fragmentLogs) ? [...user.fragmentLogs] : [];
        logs.unshift({ date: new Date().toISOString(), source: `Merged duplicate ${keeper.card.githubUsername} cards`, language: lang, amount: fragments });
        await tx.user.update({ where: { id: g.userId }, data: { fragments: balance, fragmentLogs: logs as Prisma.InputJsonValue } });
      }
    });
  }

  const left = await prisma.$queryRaw<{ c: number }[]>`
    SELECT COUNT(*)::int c FROM (SELECT 1 FROM "UserCard" GROUP BY "userId", "cardId" HAVING COUNT(*) > 1) t`;
  console.log(`\nDuplicate groups left: ${left[0].c}`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
