-- Referrals (additive): who invited this account and whether the referral BITS were paid
ALTER TABLE "User" ADD COLUMN "referredById" TEXT;
ALTER TABLE "User" ADD COLUMN "referralRewardPaid" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "User_referredById_idx" ON "User"("referredById");
