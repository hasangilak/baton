# Claude Code + Baton Integration Usage Examples

## 🚀 Getting Started

### First Session
After running the setup script, simply start Claude Code:

```bash
claude
```

**What happens automatically:**
1. SessionStart hook detects your workspace
2. Creates or links to a Baton project
3. Sets up project context
4. You're ready to work!

## 📋 Plan Management Examples

### Creating Plans

**Simple Plan Creation:**
```
User: "Create a plan to implement user authentication"

Claude: I'll create a comprehensive authentication plan for you.

*Automatically uses PlanWrite to save the plan to Baton*
✅ Plan saved with ID: plan_auth_2024_001
```

**Complex Project Planning:**
```
User: "Plan a complete e-commerce checkout flow with payment integration"

Claude: I'll break this down into a detailed implementation plan.

*Creates multi-phase plan with milestones*
*Automatically links to current project*
✅ Plan "E-commerce Checkout Implementation" created
```

### Plan Status Updates

**Accepting Plans:**
```
User: "Yes, I want to implement this authentication plan"

Claude: Great! I'll mark this plan as accepted and start creating todos.

*Automatically updates plan status to "accepted"*
*Sets active plan context for todo linking*
✅ Plan accepted - todos will auto-link to this plan
```

**Completing Plans:**
```
User: "The authentication feature is fully implemented"

Claude: Excellent! I'll mark the plan as implemented.

*Updates plan status to "implemented"*
*Triggers completion notifications*
✅ Plan marked as implemented
```

## ✅ Todo Management Examples

### Creating Todos

**Basic Todo Creation:**
```
User: "Add todos for testing the authentication endpoints"

Claude: I'll create testing todos for the authentication system.

*Creates todos with auto-linked project context*
*Links to active plan if available*
✅ Created 5 testing todos linked to authentication plan
```

**Detailed Todo Breakdown:**
```
User: "Break down the login component implementation into specific todos"

Claude: I'll create detailed implementation todos.

*Creates granular todos with priorities*
*Automatically sets project context*
✅ Created 8 todos for login component implementation
```

### Updating Todo Status

**Completing Todos:**
```
User: "I finished implementing the login form validation"

Claude: Great! I'll mark that todo as completed.

*Updates todo status in Baton*
*Checks if plan should be updated*
*Triggers sync notifications*
✅ Todo marked complete - plan progress updated
```

**Bulk Status Updates:**
```
User: "I completed all the frontend todos for authentication"

Claude: I'll update all the frontend authentication todos as completed.

*Batch updates multiple todos*
*Triggers plan status check*
*May auto-complete plan if all todos done*
✅ Updated 6 todos - authentication plan 75% complete
```

## 🔄 Synchronization Examples

### Auto-Sync Scenarios

**Todos to Tasks:**
```
User: "Convert my current todos into Baton tasks"

Claude: I'll sync your todos to create actionable Baton tasks.

*Automatically gets project context*
*Creates corresponding tasks in Baton*
*Maintains links between todos and tasks*
✅ Synced 12 todos to Baton tasks
```

**Tasks to Todos:**
```
User: "Pull my Baton tasks into Claude Code todos"

Claude: I'll import your Baton tasks as todos for tracking.

*Fetches tasks from current project*
*Creates corresponding todos*
*Preserves task metadata and status*
✅ Imported 8 Baton tasks as todos
```

### Bidirectional Sync

**Keep Everything in Sync:**
```
User: "Make sure my todos and Baton tasks are synchronized"

Claude: I'll synchronize both directions to keep everything aligned.

*Compares todos vs tasks*
*Updates statuses in both directions*
*Resolves conflicts intelligently*
✅ Synchronized 15 items - 3 updates applied
```

## 🎯 Context-Aware Workflows

### Project-Aware Commands

**No Manual Setup Needed:**
```
User: "Show me the current project status"

Claude: *Automatically knows you're in project "E-commerce App"*

Current Project: E-commerce App (proj_ecom_001)
- Active Plan: Checkout Implementation 
- Todo Progress: 12/20 completed
- Recent Activity: Authentication module completed
```

**Intelligent Plan Linking:**
```
User: "Add error handling todos"

Claude: I'll add error handling todos to your current checkout plan.

*Detects active plan context*
*Links new todos automatically*
*Maintains workflow continuity*
✅ Added 4 error handling todos to Checkout Implementation plan
```

### Smart Intent Detection

**Plan Creation Intent:**
```
User: "I need to implement a notification system"

Claude: *Detects plan creation intent via UserPromptSubmit hook*

📋 Context: Working in project "E-commerce App" - I'll create a plan for notification system implementation.

*Prepares for plan mode automatically*
*Sets up project context*
*Creates comprehensive implementation plan*
```

**Completion Intent:**
```
User: "Finished with the payment gateway integration"

Claude: *Detects completion intent*

✅ Context: I'll mark the payment gateway todos as complete and update the plan status.

*Finds related todos and plan*
*Updates completion status*
*Triggers notifications*
```

## 🔧 Advanced Usage Patterns

### Multi-Project Workflows

**Project Switching:**
```bash
# In project A
cd /path/to/project-a
claude

User: "Create todos for the API endpoints"
# *Automatically detects project A context*

# Switch to project B  
cd /path/to/project-b
claude

User: "Show me the current plan status"
# *Automatically detects project B context*
```

### Webhook Integration

**External Notifications:**
```json
// .baton-project configuration
{
  "projectId": "proj_123",
  "webhookUrl": "https://slack.webhook.url",
  "autoSyncTodosToTasks": true,
  "notificationLevel": "verbose"
}
```

**Result:**
- Plan updates → Slack notifications
- Todo completions → Team notifications  
- Auto-sync events → Progress updates

### Custom Workflows

**Daily Standup Preparation:**
```
User: "Prepare my standup update"

Claude: I'll generate your standup based on recent activity.

*Reads todo completion history*
*Checks plan progress*
*Summarizes achievements*

## Yesterday's Accomplishments:
- ✅ Completed authentication module (5/5 todos)
- ✅ Started payment integration (2/8 todos)

## Today's Focus:
- Payment gateway API integration
- Error handling implementation

## Blockers:
- Waiting for payment provider credentials
```

**Sprint Planning:**
```
User: "Plan the next sprint with current backlog"

Claude: I'll create a sprint plan using your Baton backlog.

*Fetches tasks from Baton project*
*Analyzes priorities and dependencies*
*Creates structured sprint plan*
*Links plan to existing tasks*
✅ Created Sprint 5 plan with 15 tasks across 3 epics
```

## 🎨 Custom Configuration Examples

### Project-Specific Settings

**High-Velocity Project:**
```json
{
  "projectId": "proj_startup_mvp",
  "autoSyncTodosToTasks": true,
  "notificationLevel": "minimal",
  "customSettings": {
    "autoCompleteSprintPlans": true,
    "dailyProgressReports": true,
    "slackIntegration": true
  }
}
```

**Enterprise Project:**
```json
{
  "projectId": "proj_enterprise_platform",
  "autoSyncTodosToTasks": false,
  "notificationLevel": "detailed",
  "webhookUrl": "https://jira.company.com/webhooks/baton",
  "customSettings": {
    "requireApprovalForSync": true,
    "auditLogging": true,
    "complianceMode": true
  }
}
```

### Team Collaboration

**Shared Project Context:**
```bash
# Team lead sets up project
echo '{
  "projectId": "proj_team_dashboard",
  "teamSettings": {
    "sharedPlans": true,
    "crossMemberVisibility": true,
    "automaticAssignment": true
  }
}' > .baton-project

# Team members automatically inherit context
git pull  # Gets .baton-project
claude    # Auto-connects to shared project
```

## 🏆 Best Practices

### Effective Todo Management
1. **Be Specific**: "Implement user login validation" vs "Fix login"
2. **Use Priorities**: Let Claude assign priorities based on context
3. **Link to Plans**: Always work within plan context for better organization
4. **Regular Sync**: Keep todos and tasks synchronized

### Plan Organization
1. **Hierarchical Planning**: Break large features into smaller plans
2. **Milestone Tracking**: Use plan status to track major milestones
3. **Context Switching**: Let hooks handle project context automatically
4. **Documentation**: Plans serve as implementation documentation

### Integration Optimization
1. **Trust the Automation**: Let hooks handle routine tasks
2. **Monitor Logs**: Check `.claude/baton-session.log` for issues
3. **Customize Settings**: Adapt configuration to your workflow
4. **Leverage Context**: Use project-aware commands for efficiency

## 🔮 Advanced Scenarios

### CI/CD Integration
```bash
# In CI pipeline
export CLAUDE_PROJECT_DIR=/build/workspace
./scripts/claude-automated-testing.sh

# Claude automatically:
# - Detects build context
# - Creates test failure todos
# - Updates plan status based on results
# - Triggers team notifications
```

### Code Review Workflows
```
User: "Review the authentication implementation and update our plan"

Claude: I'll review the auth code and update the plan status.

*Analyzes implementation*
*Checks against plan requirements*
*Updates plan with completion status*
*Creates follow-up todos for improvements*
✅ Plan updated - authentication 95% complete, 2 refinement todos added
```

This integration transforms Claude Code from a development assistant into a comprehensive project management companion that seamlessly coordinates with your Baton workspace.