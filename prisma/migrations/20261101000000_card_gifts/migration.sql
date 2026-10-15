-- Card gifts between friends (additive): one row per gift, for the daily limits and the feed
CREATE TABLE "CardGift" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "isShiny" BOOLEAN NOT NULL DEFAULT false,
    "fee" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardGift_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CardGift_senderId_createdAt_idx" ON "CardGift"("senderId", "createdAt");
CREATE INDEX "CardGift_receiverId_createdAt_idx" ON "CardGift"("receiverId", "createdAt");

ALTER TABLE "CardGift" ADD CONSTRAINT "CardGift_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardGift" ADD CONSTRAINT "CardGift_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardGift" ADD CONSTRAINT "CardGift_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
