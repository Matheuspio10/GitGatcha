-- Developers who asked to leave the game, and the mark on their (anonymized) card
ALTER TABLE "Card" ADD COLUMN "removedAt" TIMESTAMP(3);

CREATE TABLE "DevRemoval" (
    "id" TEXT NOT NULL,
    "githubLogin" TEXT NOT NULL,
    "githubId" INTEGER,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevRemoval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DevRemoval_githubLogin_key" ON "DevRemoval"("githubLogin");
CREATE UNIQUE INDEX "DevRemoval_githubId_key" ON "DevRemoval"("githubId");
