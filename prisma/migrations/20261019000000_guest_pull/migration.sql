-- Free booster opened by a visitor before signing up (additive)
CREATE TABLE "GuestPull" (
    "id" TEXT NOT NULL,
    "cardIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "GuestPull_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GuestPull_createdAt_idx" ON "GuestPull"("createdAt");
