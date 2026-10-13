-- Ranked seasons (additive)
ALTER TABLE "User" ADD COLUMN "seasonPeakRating" INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "User" ADD COLUMN "seasonBattles" INTEGER NOT NULL DEFAULT 0;
-- The season peak starts at each player's current rating
UPDATE "User" SET "seasonPeakRating" = "rating";

CREATE TABLE "Season" (
    "id" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SeasonResult" (
    "id" TEXT NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "finalRating" INTEGER NOT NULL,
    "peakRating" INTEGER NOT NULL,
    "tier" TEXT NOT NULL,
    "rewardBits" INTEGER NOT NULL,
    "battles" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeasonResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SeasonResult_seasonId_userId_key" ON "SeasonResult"("seasonId", "userId");
CREATE INDEX "SeasonResult_userId_idx" ON "SeasonResult"("userId");
ALTER TABLE "SeasonResult" ADD CONSTRAINT "SeasonResult_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SeasonResult" ADD CONSTRAINT "SeasonResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Season 1 starts now and ends on the first day of next month (UTC)
INSERT INTO "Season" ("id", "startsAt", "endsAt")
VALUES (1, NOW(), (date_trunc('month', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 month'));
