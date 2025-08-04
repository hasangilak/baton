/*
  Warnings:

  - You are about to drop the column `created_at` on the `claude_todos` table. All the data in the column will be lost.
  - You are about to drop the column `created_by` on the `claude_todos` table. All the data in the column will be lost.
  - You are about to drop the column `order_index` on the `claude_todos` table. All the data in the column will be lost.
  - You are about to drop the column `project_id` on the `claude_todos` table. All the data in the column will be lost.
  - You are about to drop the column `synced_task_id` on the `claude_todos` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `claude_todos` table. All the data in the column will be lost.
  - Added the required column `projectId` to the `claude_todos` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `claude_todos` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "claude_todos" DROP CONSTRAINT "claude_todos_project_id_fkey";

-- DropForeignKey
ALTER TABLE "claude_todos" DROP CONSTRAINT "claude_todos_synced_task_id_fkey";

-- DropIndex
DROP INDEX "claude_todos_order_index_idx";

-- DropIndex
DROP INDEX "claude_todos_project_id_idx";

-- AlterTable
ALTER TABLE "claude_todos" DROP COLUMN "created_at",
DROP COLUMN "created_by",
DROP COLUMN "order_index",
DROP COLUMN "project_id",
DROP COLUMN "synced_task_id",
DROP COLUMN "updated_at",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" TEXT NOT NULL DEFAULT 'claude',
ADD COLUMN     "orderIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "projectId" TEXT NOT NULL,
ADD COLUMN     "syncedTaskId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "claude_todos_projectId_idx" ON "claude_todos"("projectId");

-- CreateIndex
CREATE INDEX "claude_todos_orderIndex_idx" ON "claude_todos"("orderIndex");

-- AddForeignKey
ALTER TABLE "claude_todos" ADD CONSTRAINT "claude_todos_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claude_todos" ADD CONSTRAINT "claude_todos_syncedTaskId_fkey" FOREIGN KEY ("syncedTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
