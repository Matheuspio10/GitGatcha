-- Card training (additive): levels bought with BITS + fragments, a battle bonus per player copy (training.ts)
ALTER TABLE "UserCard" ADD COLUMN "trainingLevel" INTEGER NOT NULL DEFAULT 0;
