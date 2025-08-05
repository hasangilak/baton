#!/bin/bash

# Claude Code UserPromptSubmit Hook for Baton Integration
# Detects plan intent and prepares context for enhanced workflows
# Usage: Called automatically by Claude Code before processing user prompts

set -euo pipefail

# Configuration
BATON_PROJECT_FILE=".baton-project"
LOG_FILE="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/baton-session.log"
CONTEXT_CACHE_FILE=".claude/baton-context-cache.json"

# Plan intent detection patterns
PLAN_INTENT_PATTERNS=(
    "create.*plan"
    "implement.*plan"
    "plan.*implement"
    "break.*down.*task"
    "create.*todo"
    "generate.*todo"
    "plan.*feature"
    "implement.*feature"
    "add.*feature"
    "build.*feature"
    "develop.*feature"
    "plan.*workflow"
    "organize.*task"
    "structure.*work"
    "plan.*project"
    "roadmap"
    "milestone"
    "sprint.*plan"
    "task.*breakdown"
    "work.*breakdown"
    "project.*plan"
)

# Task completion patterns
COMPLETION_PATTERNS=(
    "complete.*task"
    "finish.*todo"
    "done.*with"
    "completed.*implementation"
    "finished.*feature"
    "ready.*review"
    "mark.*complete"
    "close.*task"
    "resolve.*todo"
)

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] UserPromptSubmit: $*" | tee -a "$LOG_FILE" >&2
}

# Function to get project context
get_project_context() {
    local context="{}"
    
    if [[ -f "$BATON_PROJECT_FILE" ]]; then
        context=$(cat "$BATON_PROJECT_FILE" 2>/dev/null || echo "{}")
    fi
    
    echo "$context"
}

# Function to detect plan intent in user prompt
detect_plan_intent() {
    local user_prompt="$1"
    local prompt_lower=$(echo "$user_prompt" | tr '[:upper:]' '[:lower:]')
    
    for pattern in "${PLAN_INTENT_PATTERNS[@]}"; do
        if echo "$prompt_lower" | grep -qE "$pattern"; then
            echo "plan_creation"
            return 0
        fi
    done
    
    for pattern in "${COMPLETION_PATTERNS[@]}"; do
        if echo "$prompt_lower" | grep -qE "$pattern"; then
            echo "task_completion"
            return 0
        fi
    done
    
    # Check for keywords that might indicate workflow intent
    if echo "$prompt_lower" | grep -qE "(todo|task|project|baton|sync|plan)"; then
        echo "workflow_related"
        return 0
    fi
    
    echo "general"
    return 0
}

# Function to prepare context injection based on intent
prepare_context_injection() {
    local intent="$1"
    local project_context="$2"
    local user_prompt="$3"
    
    local context_injection=""
    local project_id=$(echo "$project_context" | jq -r '.projectId // empty' 2>/dev/null || true)
    local project_name=$(echo "$project_context" | jq -r '.projectName // empty' 2>/dev/null || true)
    
    case "$intent" in
        "plan_creation")
            if [[ -n "$project_id" ]]; then
                context_injection="📋 Context: Working in Baton project '$project_name' (ID: $project_id). When creating plans, use PlanWrite tool to save them automatically."
            else
                context_injection="📋 Context: No Baton project detected. Consider using 'detect_workspace_project' to link this workspace to a Baton project for enhanced plan management."
            fi
            ;;
        "task_completion")
            if [[ -n "$project_id" ]]; then
                context_injection="✅ Context: Working in Baton project '$project_name'. When marking tasks/todos as complete, use TodoWrite tool to update their status automatically."
            fi
            ;;
        "workflow_related")
            if [[ -n "$project_id" ]]; then
                context_injection="🔧 Context: Baton project '$project_name' is active. You have access to TodoRead, TodoWrite, PlanRead, PlanWrite, and sync tools for task management."
            else
                context_injection="🔧 Context: Baton tools are available. Use 'detect_workspace_project' to link this workspace to a project for enhanced task management."
            fi
            ;;
        "general")
            # Only inject minimal context for general queries
            if [[ -n "$project_id" ]]; then
                context_injection="📁 Context: Baton project '$project_name' is active."
            fi
            ;;
    esac
    
    echo "$context_injection"
}

# Function to update context cache
update_context_cache() {
    local intent="$1"
    local user_prompt="$2"
    local context_injection="$3"
    local project_id="$4"
    
    mkdir -p .claude
    
    local cache_entry=$(jq -n \
        --arg intent "$intent" \
        --arg prompt "$user_prompt" \
        --arg context "$context_injection" \
        --arg project_id "$project_id" \
        --arg timestamp "$(date -Iseconds)" \
        '{
            intent: $intent,
            promptPreview: ($prompt | .[0:100]),
            contextInjected: $context,
            projectId: $project_id,
            timestamp: $timestamp
        }')
    
    # Read existing cache or create empty array
    local existing_cache="[]"
    if [[ -f "$CONTEXT_CACHE_FILE" ]]; then
        existing_cache=$(cat "$CONTEXT_CACHE_FILE" 2>/dev/null || echo "[]")
    fi
    
    # Add new entry and limit to last 20 entries
    echo "$existing_cache" | jq --argjson entry "$cache_entry" '. + [$entry] | .[-20:]' > "$CONTEXT_CACHE_FILE"
}

# Function to check for recent plan activity
check_recent_plan_activity() {
    local project_id="$1"
    
    if [[ -z "$project_id" ]]; then
        return 1
    fi
    
    # Check if there's been recent plan activity (last 30 minutes)
    if [[ -f "$CONTEXT_CACHE_FILE" ]]; then
        local recent_plan_activity=$(jq -r --arg project_id "$project_id" --arg cutoff "$(date -d '30 minutes ago' -Iseconds)" '
            .[] | select(.projectId == $project_id and .timestamp > $cutoff and .intent == "plan_creation") | .timestamp
        ' "$CONTEXT_CACHE_FILE" 2>/dev/null | head -1 || true)
        
        if [[ -n "$recent_plan_activity" ]]; then
            return 0
        fi
    fi
    
    return 1
}

# Function to prepare enhanced prompt
prepare_enhanced_prompt() {
    local original_prompt="$1"
    local context_injection="$2"
    
    if [[ -z "$context_injection" ]]; then
        echo "$original_prompt"
        return 0
    fi
    
    # Inject context at the beginning of the prompt
    echo "$context_injection

$original_prompt"
}

# Main execution
main() {
    local user_prompt="${1:-}"
    
    if [[ -z "$user_prompt" ]]; then
        # No prompt to process, return as-is
        echo "$user_prompt"
        return 0
    fi
    
    log "🔍 Analyzing user prompt for Baton workflow context"
    
    # Get project context
    local project_context=$(get_project_context)
    local project_id=$(echo "$project_context" | jq -r '.projectId // empty' 2>/dev/null || true)
    
    # Detect intent
    local intent=$(detect_plan_intent "$user_prompt")
    log "🎯 Detected intent: $intent"
    
    # Prepare context injection
    local context_injection=$(prepare_context_injection "$intent" "$project_context" "$user_prompt")
    
    # Check for recent plan activity to enhance context
    if [[ "$intent" == "workflow_related" ]] && check_recent_plan_activity "$project_id"; then
        local activity_context=" Recent plan activity detected - continue building on existing plans."
        context_injection="$context_injection$activity_context"
    fi
    
    # Update context cache
    update_context_cache "$intent" "$user_prompt" "$context_injection" "$project_id"
    
    # Prepare enhanced prompt
    local enhanced_prompt=$(prepare_enhanced_prompt "$user_prompt" "$context_injection")
    
    if [[ "$context_injection" != "" ]]; then
        log "✅ Context injection prepared: ${#context_injection} characters"
    fi
    
    # Return the enhanced prompt
    echo "$enhanced_prompt"
    
    return 0
}

# Error handling - return original prompt if hook fails
trap 'log "❌ Error in userPromptSubmit hook at line $LINENO"; echo "$1"; exit 0' ERR

# Execute main function
main "$@"