-- New-player onboarding state (nullable: existing players never see it)
ALTER TABLE "User" ADD COLUMN "onboarding" JSONB;
