-- Sprints (additive): daily and weekly themed competitions and where each player finished
CREATE TABLE "Sprint" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "Sprint_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Sprint_closedAt_endsAt_idx" ON "Sprint"("closedAt", "endsAt");

CREATE TABLE "SprintResult" (
    "sprintId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "rewardBits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SprintResult_pkey" PRIMARY KEY ("sprintId", "userId")
);
CREATE INDEX "SprintResult_userId_idx" ON "SprintResult"("userId");
ALTER TABLE "SprintResult" ADD CONSTRAINT "SprintResult_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SprintResult" ADD CONSTRAINT "SprintResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
