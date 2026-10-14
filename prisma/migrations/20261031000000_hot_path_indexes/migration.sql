-- Indexes for the hot paths (additive): battles by player and status, challenge expiry,
-- incoming friend requests, and cards by rarity/language (reserve fallback, Sprints, Dev of the Week)
CREATE INDEX "Battle_challengerId_status_idx" ON "Battle"("challengerId", "status");
CREATE INDEX "Battle_defenderId_status_idx" ON "Battle"("defenderId", "status");
CREATE INDEX "Battle_winnerId_idx" ON "Battle"("winnerId");
CREATE INDEX "Battle_status_expiresAt_idx" ON "Battle"("status", "expiresAt");
CREATE INDEX "Friendship_friendId_status_idx" ON "Friendship"("friendId", "status");
CREATE INDEX "Card_rarity_primaryLanguage_idx" ON "Card"("rarity", "primaryLanguage");
CREATE INDEX "Card_primaryLanguage_idx" ON "Card"("primaryLanguage");
