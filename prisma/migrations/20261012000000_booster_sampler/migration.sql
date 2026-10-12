-- CreateTable
CREATE TABLE "GithubCache" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GithubCache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "OrgMember" (
    "org" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "followers" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgMember_pkey" PRIMARY KEY ("org","login")
);

-- CreateTable
CREATE TABLE "RecentPull" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "githubUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecentPull_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GithubCache_expiresAt_idx" ON "GithubCache"("expiresAt");

-- CreateIndex
CREATE INDEX "OrgMember_org_followers_idx" ON "OrgMember"("org", "followers");

-- CreateIndex
CREATE INDEX "RecentPull_userId_packId_createdAt_idx" ON "RecentPull"("userId", "packId", "createdAt");

-- CreateIndex
CREATE INDEX "RecentPull_createdAt_idx" ON "RecentPull"("createdAt");

