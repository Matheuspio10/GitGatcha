-- Weekly and dev (GitHub activity) missions next to the daily ones, and the daily swap (additive)
ALTER TABLE "UserMission" ADD COLUMN "period" TEXT NOT NULL DEFAULT 'daily';
ALTER TABLE "User" ADD COLUMN "missionRerollAt" TIMESTAMP(3);
