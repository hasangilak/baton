#!/bin/bash

# Claude Code SessionStart Hook for Baton Integration
# Auto-detects workspace and initializes Baton project context
# Usage: Called automatically by Claude Code on session start

set -euo pipefail

# Configuration
BATON_PROJECT_FILE=".baton-project"
LOG_FILE="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/baton-session.log"
BATON_API_URL="${BATON_API_URL:-http://localhost:3001}"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] SessionStart: $*" | tee -a "$LOG_FILE" >&2
}

# Function to check if Baton server is running
check_baton_server() {
    if curl -s "$BATON_API_URL/api/health" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to get project list from Baton API
get_projects() {
    curl -s "$BATON_API_URL/api/projects" 2>/dev/null | jq -r '.projects[]? | .id + "|" + .name' 2>/dev/null || true
}

# Function to create or find project based on directory name
setup_project_context() {
    local current_dir=$(basename "$(pwd)")
    
    # Check if .baton-project already exists
    if [[ -f "$BATON_PROJECT_FILE" ]]; then
        local existing_project_id=$(jq -r '.projectId // empty' "$BATON_PROJECT_FILE" 2>/dev/null || true)
        if [[ -n "$existing_project_id" && "$existing_project_id" != "null" ]]; then
            log "✅ Found existing project context: $existing_project_id"
            return 0
        fi
    fi
    
    # Check if Baton server is running
    if ! check_baton_server; then
        log "⚠️  Baton server not accessible at $BATON_API_URL"
        log "💡 Start with: docker compose up -d"
        # Create a placeholder project file
        echo '{"projectId":"","note":"Baton server not running - configure manually"}' > "$BATON_PROJECT_FILE"
        return 1
    fi
    
    log "🔍 Baton server accessible, setting up project context..."
    
    # Get existing projects
    local projects=$(get_projects)
    
    if [[ -n "$projects" ]]; then
        # Try to find project by name matching current directory
        local matching_project=$(echo "$projects" | grep -i "|.*$current_dir.*" | head -1 || true)
        
        if [[ -n "$matching_project" ]]; then
            local project_id=$(echo "$matching_project" | cut -d'|' -f1)
            local project_name=$(echo "$matching_project" | cut -d'|' -f2)
            
            # Create project context file
            jq -n \
                --arg id "$project_id" \
                --arg name "$project_name" \
                --arg detected_at "$(date -Iseconds)" \
                '{
                    projectId: $id,
                    projectName: $name,
                    detectedAt: $detected_at,
                    autoDetected: true,
                    workspacePath: env.PWD
                }' > "$BATON_PROJECT_FILE"
            
            log "✅ Auto-linked to existing project: $project_name ($project_id)"
            return 0
        fi
    fi
    
    # No matching project found, create new one
    log "📝 Creating new project for workspace: $current_dir"
    
    local create_response=$(curl -s -X POST "$BATON_API_URL/api/projects" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"$current_dir\",
            \"description\": \"Auto-created from Claude Code workspace\",
            \"color\": \"#3b82f6\"
        }" 2>/dev/null || true)
    
    if [[ -n "$create_response" ]]; then
        local new_project_id=$(echo "$create_response" | jq -r '.project.id // empty' 2>/dev/null || true)
        
        if [[ -n "$new_project_id" && "$new_project_id" != "null" ]]; then
            # Create project context file
            jq -n \
                --arg id "$new_project_id" \
                --arg name "$current_dir" \
                --arg detected_at "$(date -Iseconds)" \
                '{
                    projectId: $id,
                    projectName: $name,
                    detectedAt: $detected_at,
                    autoCreated: true,
                    workspacePath: env.PWD
                }' > "$BATON_PROJECT_FILE"
            
            log "✅ Created new project: $current_dir ($new_project_id)"
            return 0
        fi
    fi
    
    log "❌ Failed to create project, creating placeholder context"
    echo '{"projectId":"","note":"Failed to auto-create project - configure manually"}' > "$BATON_PROJECT_FILE"
    return 1
}

# Function to validate Claude Code environment
validate_claude_environment() {
    if [[ -z "${CLAUDE_PROJECT_DIR:-}" ]]; then
        log "⚠️  CLAUDE_PROJECT_DIR not set, using current directory"
    fi
    
    # Ensure .claude directory exists
    mkdir -p .claude
}

# Main execution
main() {
    log "🚀 Initializing Baton context for workspace: $(pwd)"
    
    # Validate environment
    validate_claude_environment
    
    # Setup project context
    if setup_project_context; then
        # Success: provide feedback to Claude
        if [[ -f "$BATON_PROJECT_FILE" ]]; then
            local project_info=$(jq -r '.projectId + " (" + (.projectName // "unknown") + ")"' "$BATON_PROJECT_FILE" 2>/dev/null || echo "configured")
            echo "✅ Baton workspace initialized: $project_info"
        else
            echo "✅ Baton workspace initialized"
        fi
    else
        # Partial success: provide guidance
        echo "⚠️  Baton context partially configured - manual setup may be needed"
    fi
    
    log "📋 Session initialization complete"
}

# Error handling
trap 'log "❌ Error in sessionStart hook at line $LINENO"; exit 1' ERR

# Execute main function
main "$@"