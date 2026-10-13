-- The Tower (additive): weekly runs per player and the weekly opponents of each floor
CREATE TABLE "TowerRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "cleared" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TowerRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TowerRun_userId_weekStart_key" ON "TowerRun"("userId", "weekStart");
CREATE INDEX "TowerRun_weekStart_cleared_idx" ON "TowerRun"("weekStart", "cleared");
ALTER TABLE "TowerRun" ADD CONSTRAINT "TowerRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TowerFloorTeam" (
    "weekStart" TIMESTAMP(3) NOT NULL,
    "floor" INTEGER NOT NULL,
    "theme" TEXT NOT NULL,
    "cardIds" TEXT[],
    CONSTRAINT "TowerFloorTeam_pkey" PRIMARY KEY ("weekStart", "floor")
);
