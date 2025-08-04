-- CreateTable
CREATE TABLE "workspace_mappings" (
    "id" TEXT NOT NULL,
    "workspacePath" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "lastAccessed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_mappings_workspacePath_key" ON "workspace_mappings"("workspacePath");

-- AddForeignKey
ALTER TABLE "workspace_mappings" ADD CONSTRAINT "workspace_mappings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
