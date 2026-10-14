-- Profile cosmetics (additive): equipped title and avatar frame, unlocked by language sets and levels (collections.ts)
ALTER TABLE "User" ADD COLUMN "title" TEXT;
ALTER TABLE "User" ADD COLUMN "frame" TEXT;
