-- Card trades between friends (additive): a proposal, then accepted / declined / cancelled / expired
CREATE TABLE "CardTrade" (
    "id" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "offeredCardIds" TEXT[],
    "requestedCardIds" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "proposerFee" INTEGER NOT NULL DEFAULT 0,
    "receiverFee" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "CardTrade_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CardTrade_proposerId_status_idx" ON "CardTrade"("proposerId", "status");
CREATE INDEX "CardTrade_receiverId_status_idx" ON "CardTrade"("receiverId", "status");

ALTER TABLE "CardTrade" ADD CONSTRAINT "CardTrade_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardTrade" ADD CONSTRAINT "CardTrade_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
