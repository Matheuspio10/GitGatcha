-- One-time reward for sharing a card or profile link (additive)
ALTER TABLE "User" ADD COLUMN "shareBonusGranted" BOOLEAN NOT NULL DEFAULT false;
