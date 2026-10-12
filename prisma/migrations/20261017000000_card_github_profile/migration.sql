-- AlterTable: GitHub profile snapshot for card titles (all nullable, additive)
ALTER TABLE "Card" ADD COLUMN "followers" INTEGER,
ADD COLUMN "totalStars" INTEGER,
ADD COLUMN "totalForks" INTEGER,
ADD COLUMN "topRepoStars" INTEGER,
ADD COLUMN "publicRepos" INTEGER,
ADD COLUMN "publicGists" INTEGER,
ADD COLUMN "languageCount" INTEGER,
ADD COLUMN "githubCreatedAt" TIMESTAMP(3),
ADD COLUMN "profileUpdatedAt" TIMESTAMP(3);
