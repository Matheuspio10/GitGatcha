-- Dev League (additive): rounds, developer prices and scores, player lineups
-- CreateTable
CREATE TABLE "LeagueRound" (
    "id" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "LeagueRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaguePrice" (
    "roundId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "form" INTEGER NOT NULL,

    CONSTRAINT "LeaguePrice_pkey" PRIMARY KEY ("roundId","cardId")
);

-- CreateTable
CREATE TABLE "LeagueDevScore" (
    "roundId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "commits" INTEGER NOT NULL DEFAULT 0,
    "pullRequests" INTEGER NOT NULL DEFAULT 0,
    "reviews" INTEGER NOT NULL DEFAULT 0,
    "issues" INTEGER NOT NULL DEFAULT 0,
    "activeDays" INTEGER NOT NULL DEFAULT 0,
    "missing" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueDevScore_pkey" PRIMARY KEY ("roundId","cardId")
);

-- CreateTable
CREATE TABLE "LeagueLineup" (
    "roundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardIds" TEXT[],
    "captainId" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER,
    "rewardBits" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueLineup_pkey" PRIMARY KEY ("roundId","userId")
);

-- CreateIndex
CREATE INDEX "LeagueRound_closedAt_endsAt_idx" ON "LeagueRound"("closedAt", "endsAt");

-- CreateIndex
CREATE INDEX "LeagueDevScore_roundId_updatedAt_idx" ON "LeagueDevScore"("roundId", "updatedAt");

-- CreateIndex
CREATE INDEX "LeagueLineup_roundId_points_idx" ON "LeagueLineup"("roundId", "points");

-- AddForeignKey
ALTER TABLE "LeaguePrice" ADD CONSTRAINT "LeaguePrice_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "LeagueRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaguePrice" ADD CONSTRAINT "LeaguePrice_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueDevScore" ADD CONSTRAINT "LeagueDevScore_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "LeagueRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueDevScore" ADD CONSTRAINT "LeagueDevScore_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueLineup" ADD CONSTRAINT "LeagueLineup_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "LeagueRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueLineup" ADD CONSTRAINT "LeagueLineup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

