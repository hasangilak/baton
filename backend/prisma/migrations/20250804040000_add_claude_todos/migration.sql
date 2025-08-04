-- CreateTable
CREATE TABLE "claude_todos" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "synced_task_id" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL DEFAULT 'claude',

    CONSTRAINT "claude_todos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "claude_todos_project_id_idx" ON "claude_todos"("project_id");
CREATE INDEX "claude_todos_status_idx" ON "claude_todos"("status");
CREATE INDEX "claude_todos_priority_idx" ON "claude_todos"("priority");
CREATE INDEX "claude_todos_order_index_idx" ON "claude_todos"("order_index");

-- AddForeignKey
ALTER TABLE "claude_todos" ADD CONSTRAINT "claude_todos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claude_todos" ADD CONSTRAINT "claude_todos_synced_task_id_fkey" FOREIGN KEY ("synced_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add check constraints
ALTER TABLE "claude_todos" ADD CONSTRAINT "claude_todos_status_check" CHECK ("status" IN ('pending', 'in_progress', 'completed'));
ALTER TABLE "claude_todos" ADD CONSTRAINT "claude_todos_priority_check" CHECK ("priority" IN ('high', 'medium', 'low'));
ALTER TABLE "claude_todos" ADD CONSTRAINT "claude_todos_created_by_check" CHECK ("created_by" IN ('claude', 'human', 'system'));