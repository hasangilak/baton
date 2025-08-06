-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "claudeSessionId" TEXT,
ADD COLUMN     "contextTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastCompacted" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "conversations_claudeSessionId_idx" ON "conversations"("claudeSessionId");
