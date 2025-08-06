-- CreateTable
CREATE TABLE "permission_rules" (
    "id" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL DEFAULT '*',
    "type" TEXT NOT NULL, -- 'allow' or 'deny'
    "project_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "permission_rules_tool_action_resource_project_id_key" ON "permission_rules"("tool", "action", "resource", "project_id");

-- CreateIndex  
CREATE INDEX "permission_rules_project_id_idx" ON "permission_rules"("project_id");

-- CreateIndex
CREATE INDEX "permission_rules_type_idx" ON "permission_rules"("type");

-- Add foreign key constraint
ALTER TABLE "permission_rules" ADD CONSTRAINT "permission_rules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;