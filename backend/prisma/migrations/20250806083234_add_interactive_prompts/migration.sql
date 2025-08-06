-- CreateTable
CREATE TABLE "interactive_prompts" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sessionId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "message" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "context" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "selectedOption" TEXT,
    "autoHandler" TEXT,
    "timeoutAt" TIMESTAMP(3) NOT NULL DEFAULT NOW() + INTERVAL '30 seconds',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "interactive_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interactive_prompts_conversationId_idx" ON "interactive_prompts"("conversationId");

-- CreateIndex
CREATE INDEX "interactive_prompts_status_idx" ON "interactive_prompts"("status");

-- CreateIndex
CREATE INDEX "interactive_prompts_timeoutAt_idx" ON "interactive_prompts"("timeoutAt");

-- CreateIndex
CREATE INDEX "interactive_prompts_sessionId_idx" ON "interactive_prompts"("sessionId");

-- AddForeignKey
ALTER TABLE "interactive_prompts" ADD CONSTRAINT "interactive_prompts_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
