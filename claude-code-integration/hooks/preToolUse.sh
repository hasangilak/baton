#!/bin/bash

# Claude Code PreToolUse Hook for Baton Integration
# Automatically injects project context into Baton MCP tool calls
# Usage: Called automatically by Claude Code before tool execution

set -euo pipefail

# Configuration
BATON_PROJECT_FILE=".baton-project"
LOG_FILE="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/baton-session.log"

# Tool names that require projectId injection
TOOLS_REQUIRING_PROJECT_ID=(
    "mcp__baton__TodoRead"
    "mcp__baton__TodoWrite"
    "mcp__baton__PlanRead" 
    "mcp__baton__PlanWrite"
    "mcp__baton__sync_todos_to_tasks"
    "mcp__baton__sync_tasks_to_todos"
    "mcp__baton__create_task"
    "mcp__baton__get_project_analytics"
    "mcp__baton__LinkTodosToplan"
)

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] PreToolUse: $*" | tee -a "$LOG_FILE" >&2
}

# Function to check if tool requires project ID
requires_project_id() {
    local tool_name="$1"
    for required_tool in "${TOOLS_REQUIRING_PROJECT_ID[@]}"; do
        if [[ "$tool_name" == "$required_tool" ]]; then
            return 0
        fi
    done
    return 1
}

# Function to get project ID from context file
get_project_id() {
    if [[ ! -f "$BATON_PROJECT_FILE" ]]; then
        log "⚠️  No $BATON_PROJECT_FILE found"
        return 1
    fi
    
    local project_id=$(jq -r '.projectId // empty' "$BATON_PROJECT_FILE" 2>/dev/null || true)
    
    if [[ -z "$project_id" || "$project_id" == "null" || "$project_id" == "" ]]; then
        log "⚠️  No valid projectId in $BATON_PROJECT_FILE"
        return 1
    fi
    
    echo "$project_id"
    return 0
}

# Function to inject project ID into tool arguments
inject_project_context() {
    local tool_name="$1"
    local tool_args="$2"
    local project_id="$3"
    
    # Parse existing arguments or create empty object
    local existing_args
    if [[ -n "$tool_args" && "$tool_args" != "null" ]]; then
        existing_args="$tool_args"
    else
        existing_args="{}"
    fi
    
    # Check if projectId already exists in arguments
    local existing_project_id=$(echo "$existing_args" | jq -r '.projectId // empty' 2>/dev/null || true)
    
    if [[ -n "$existing_project_id" && "$existing_project_id" != "null" && "$existing_project_id" != "" ]]; then
        log "📋 Tool $tool_name already has projectId: $existing_project_id"
        echo "$existing_args"
        return 0
    fi
    
    # Inject projectId into arguments
    local updated_args=$(echo "$existing_args" | jq --arg project_id "$project_id" '. + {projectId: $project_id}' 2>/dev/null || echo "{\"projectId\":\"$project_id\"}")
    
    log "✅ Injected projectId '$project_id' into $tool_name"
    echo "$updated_args"
    return 0
}

# Function to handle special tool-specific logic
handle_special_cases() {
    local tool_name="$1"
    local tool_args="$2"
    local project_id="$3"
    
    case "$tool_name" in
        "mcp__baton__detect_workspace_project")
            # For detect_workspace_project, provide the answer directly
            log "🔄 Intercepting detect_workspace_project call"
            jq -n \
                --arg project_id "$project_id" \
                '{
                    success: true,
                    projectId: $project_id,
                    source: "hook_injection",
                    message: "Project ID automatically provided by preToolUse hook"
                }'
            return 0
            ;;
        "mcp__baton__get_workspace_info")
            # For get_workspace_info, we can let it proceed normally
            echo "$tool_args"
            return 0
            ;;
        *)
            # Standard project ID injection
            inject_project_context "$tool_name" "$tool_args" "$project_id"
            return 0
            ;;
    esac
}

# Main execution
main() {
    local tool_name="${1:-}"
    local tool_args="${2:-{}}"
    
    # Skip if not a Baton MCP tool
    if [[ ! "$tool_name" =~ ^mcp__baton__ ]]; then
        # Return original arguments unchanged
        echo "$tool_args"
        return 0
    fi
    
    log "🔧 Processing Baton tool: $tool_name"
    
    # Get project ID from context
    local project_id
    if ! project_id=$(get_project_id); then
        log "❌ Cannot get project ID for $tool_name"
        # Return original arguments - let the tool handle the missing project ID
        echo "$tool_args"
        return 0
    fi
    
    # Handle tool-specific cases
    if requires_project_id "$tool_name" || [[ "$tool_name" == "mcp__baton__detect_workspace_project" ]]; then
        handle_special_cases "$tool_name" "$tool_args" "$project_id"
    else
        log "📋 Tool $tool_name does not require project ID injection"
        echo "$tool_args"
    fi
    
    return 0
}

# Error handling
trap 'log "❌ Error in preToolUse hook at line $LINENO"; echo "$2"; exit 0' ERR

# Execute main function - always return the arguments (modified or original)
main "$@"