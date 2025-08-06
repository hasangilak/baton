-- CreateTable
CREATE TABLE "conversation_permissions" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'granted',
    "grantedBy" TEXT NOT NULL DEFAULT 'user',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "conversation_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_permissions_conversationId_idx" ON "conversation_permissions"("conversationId");

-- CreateIndex
CREATE INDEX "conversation_permissions_toolName_idx" ON "conversation_permissions"("toolName");

-- CreateIndex
CREATE INDEX "conversation_permissions_status_idx" ON "conversation_permissions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_permissions_conversationId_toolName_key" ON "conversation_permissions"("conversationId", "toolName");

-- AddForeignKey
ALTER TABLE "conversation_permissions" ADD CONSTRAINT "conversation_permissions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;