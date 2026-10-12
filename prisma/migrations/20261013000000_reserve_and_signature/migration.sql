-- AlterTable
ALTER TABLE "User" ADD COLUMN     "githubBonusGranted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserCard" ADD COLUMN     "edition" TEXT NOT NULL DEFAULT 'standard';

-- CreateTable
CREATE TABLE "BoosterReserve" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "githubUsername" TEXT NOT NULL,
    "stats" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoosterReserve_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoosterReserve_packId_rarity_createdAt_idx" ON "BoosterReserve"("packId", "rarity", "createdAt");

