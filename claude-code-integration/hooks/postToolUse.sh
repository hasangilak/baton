#!/bin/bash

# Claude Code PostToolUse Hook for Baton Integration
# Triggers synchronization and notifications after Baton tool execution
# Usage: Called automatically by Claude Code after successful tool completion

set -euo pipefail

# Configuration
BATON_PROJECT_FILE=".baton-project"
LOG_FILE="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/baton-session.log"
BATON_API_URL="${BATON_API_URL:-http://localhost:3001}"
SYNC_CACHE_FILE=".claude/baton-sync-cache.json"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] PostToolUse: $*" | tee -a "$LOG_FILE" >&2
}

# Function to get project ID from context file
get_project_id() {
    if [[ ! -f "$BATON_PROJECT_FILE" ]]; then
        return 1
    fi
    
    local project_id=$(jq -r '.projectId // empty' "$BATON_PROJECT_FILE" 2>/dev/null || true)
    
    if [[ -z "$project_id" || "$project_id" == "null" || "$project_id" == "" ]]; then
        return 1
    fi
    
    echo "$project_id"
    return 0
}

# Function to update sync cache with operation metadata
update_sync_cache() {
    local tool_name="$1"
    local operation_result="$2"
    local project_id="$3"
    
    mkdir -p .claude
    
    local cache_entry=$(jq -n \
        --arg tool "$tool_name" \
        --arg timestamp "$(date -Iseconds)" \
        --arg project_id "$project_id" \
        --argjson result "$operation_result" \
        '{
            tool: $tool,
            timestamp: $timestamp,
            projectId: $project_id,
            result: $result,
            processed: false
        }')
    
    # Read existing cache or create empty array
    local existing_cache="[]"
    if [[ -f "$SYNC_CACHE_FILE" ]]; then
        existing_cache=$(cat "$SYNC_CACHE_FILE" 2>/dev/null || echo "[]")
    fi
    
    # Add new entry and limit to last 50 entries
    echo "$existing_cache" | jq --argjson entry "$cache_entry" '. + [$entry] | .[-50:]' > "$SYNC_CACHE_FILE"
}

# Function to handle PlanWrite operations
handle_plan_write() {
    local tool_result="$1"
    local project_id="$2"
    
    log "📋 Processing PlanWrite operation"
    
    # Extract plan information from result
    local plan_count=$(echo "$tool_result" | jq -r '.count // 0' 2>/dev/null || echo "0")
    local success=$(echo "$tool_result" | jq -r '.success // false' 2>/dev/null || echo "false")
    
    if [[ "$success" == "true" && "$plan_count" -gt 0 ]]; then
        log "✅ Plan operation successful: $plan_count plan(s) processed"
        
        # Trigger UI refresh notification (if supported)
        if command -v notify-send >/dev/null 2>&1; then
            notify-send "Baton" "Plan updated: $plan_count plan(s) synchronized" 2>/dev/null || true
        fi
        
        # Optional: Trigger external webhook or API call
        trigger_webhook "plan_updated" "$project_id" "$plan_count"
    else
        log "⚠️  Plan operation completed with issues"
    fi
}

# Function to handle TodoWrite operations
handle_todo_write() {
    local tool_result="$1"
    local project_id="$2"
    
    log "📝 Processing TodoWrite operation"
    
    # Extract todo information from result
    local todo_count=$(echo "$tool_result" | jq -r '.count // 0' 2>/dev/null || echo "0")
    local success=$(echo "$tool_result" | jq -r '.success // false' 2>/dev/null || echo "false")
    
    if [[ "$success" == "true" && "$todo_count" -gt 0 ]]; then
        log "✅ Todo operation successful: $todo_count todo(s) processed"
        
        # Trigger UI refresh notification
        if command -v notify-send >/dev/null 2>&1; then
            notify-send "Baton" "Todos updated: $todo_count todo(s) synchronized" 2>/dev/null || true
        fi
        
        # Check if we should auto-sync todos to tasks
        auto_sync_todos_to_tasks "$project_id" "$todo_count"
        
        # Trigger external webhook
        trigger_webhook "todos_updated" "$project_id" "$todo_count"
    else
        log "⚠️  Todo operation completed with issues"
    fi
}

# Function to handle sync operations
handle_sync_operation() {
    local tool_name="$1"
    local tool_result="$2"
    local project_id="$3"
    
    log "🔄 Processing sync operation: $tool_name"
    
    local synced_count=$(echo "$tool_result" | jq -r '.syncedCount // 0' 2>/dev/null || echo "0")
    local success=$(echo "$tool_result" | jq -r '.success // false' 2>/dev/null || echo "false")
    
    if [[ "$success" == "true" && "$synced_count" -gt 0 ]]; then
        local sync_type="unknown"
        case "$tool_name" in
            "mcp__baton__sync_todos_to_tasks")
                sync_type="todos → tasks"
                ;;
            "mcp__baton__sync_tasks_to_todos")
                sync_type="tasks → todos"
                ;;
        esac
        
        log "✅ Sync operation successful: $synced_count items ($sync_type)"
        
        if command -v notify-send >/dev/null 2>&1; then
            notify-send "Baton" "Sync complete: $synced_count items ($sync_type)" 2>/dev/null || true
        fi
        
        trigger_webhook "sync_completed" "$project_id" "$synced_count"
    fi
}

# Function to auto-sync todos to tasks (configurable behavior)
auto_sync_todos_to_tasks() {
    local project_id="$1"
    local todo_count="$2"
    
    # Read configuration for auto-sync behavior
    local auto_sync_enabled=$(jq -r '.autoSyncTodosToTasks // false' "$BATON_PROJECT_FILE" 2>/dev/null || echo "false")
    
    if [[ "$auto_sync_enabled" == "true" ]]; then
        log "🔄 Auto-syncing todos to tasks..."
        
        # Call the sync API directly (bypass Claude Code for this automation)
        curl -s -X POST "$BATON_API_URL/api/claude/sync-todos-to-tasks" \
            -H "Content-Type: application/json" \
            -d "{\"projectId\":\"$project_id\"}" >/dev/null 2>&1 || true
            
        log "✅ Auto-sync completed"
    fi
}

# Function to trigger external webhooks (for integrations)
trigger_webhook() {
    local event_type="$1"
    local project_id="$2"
    local count="$3"
    
    # Read webhook URL from project config
    local webhook_url=$(jq -r '.webhookUrl // empty' "$BATON_PROJECT_FILE" 2>/dev/null || true)
    
    if [[ -n "$webhook_url" ]]; then
        log "🌐 Triggering webhook: $event_type"
        
        local payload=$(jq -n \
            --arg event "$event_type" \
            --arg project_id "$project_id" \
            --arg count "$count" \
            --arg timestamp "$(date -Iseconds)" \
            '{
                event: $event,
                projectId: $project_id,
                count: ($count | tonumber),
                timestamp: $timestamp,
                source: "claude_code_hook"
            }')
        
        curl -s -X POST "$webhook_url" \
            -H "Content-Type: application/json" \
            -d "$payload" >/dev/null 2>&1 || true
    fi
}

# Function to show summary notification
show_summary() {
    local tool_name="$1"
    local success="$2"
    local message="$3"
    
    if [[ "$success" == "true" ]]; then
        echo "✅ $tool_name completed successfully"
        if [[ -n "$message" ]]; then
            echo "   $message"
        fi
    else
        echo "⚠️  $tool_name completed with issues"
    fi
}

# Main execution
main() {
    local tool_name="${1:-}"
    local tool_result="${2:-{}}"
    local tool_success="${3:-false}"
    
    # Skip if not a Baton MCP tool
    if [[ ! "$tool_name" =~ ^mcp__baton__ ]]; then
        return 0
    fi
    
    log "🔧 Post-processing Baton tool: $tool_name"
    
    # Get project ID from context
    local project_id
    if ! project_id=$(get_project_id); then
        log "⚠️  Cannot get project ID for post-processing"
        return 0
    fi
    
    # Update sync cache
    update_sync_cache "$tool_name" "$tool_result" "$project_id"
    
    # Handle specific tool operations
    case "$tool_name" in
        "mcp__baton__PlanWrite")
            handle_plan_write "$tool_result" "$project_id"
            ;;
        "mcp__baton__TodoWrite")
            handle_todo_write "$tool_result" "$project_id"
            ;;
        "mcp__baton__sync_todos_to_tasks"|"mcp__baton__sync_tasks_to_todos")
            handle_sync_operation "$tool_name" "$tool_result" "$project_id"
            ;;
        "mcp__baton__create_task"|"mcp__baton__update_task"|"mcp__baton__move_task")
            log "📋 Task operation completed"
            local task_title=$(echo "$tool_result" | jq -r '.task.title // "task"' 2>/dev/null || echo "task")
            if command -v notify-send >/dev/null 2>&1; then
                notify-send "Baton" "Task updated: $task_title" 2>/dev/null || true
            fi
            ;;
    esac
    
    # Show summary to user
    local success=$(echo "$tool_result" | jq -r '.success // false' 2>/dev/null || echo "$tool_success")
    local message=$(echo "$tool_result" | jq -r '.message // empty' 2>/dev/null || true)
    show_summary "$tool_name" "$success" "$message"
    
    log "📋 Post-processing complete for $tool_name"
    return 0
}

# Error handling - don't fail Claude Code execution if hook fails
trap 'log "❌ Error in postToolUse hook at line $LINENO"; exit 0' ERR

# Execute main function
main "$@"