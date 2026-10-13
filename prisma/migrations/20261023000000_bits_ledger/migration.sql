-- BITS history (additive): one row per balance change
CREATE TABLE "BitsTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BitsTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BitsTransaction_userId_createdAt_idx" ON "BitsTransaction"("userId", "createdAt");

ALTER TABLE "BitsTransaction" ADD CONSTRAINT "BitsTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Opening balance: the history of every existing player starts from today's balance,
-- so the sum of a player's rows always equals their BITS
INSERT INTO "BitsTransaction" ("id", "userId", "amount", "balanceAfter", "reason", "detail")
SELECT gen_random_uuid()::text, "id", "currency", "currency", 'opening_balance', 'Balance when the BITS history started'
FROM "User";
