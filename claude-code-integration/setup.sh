#!/bin/bash

# Claude Code + Baton Integration Setup Script
# Automatically configures Claude Code for seamless Baton integration

set -euo pipefail

# Parse command line arguments
NON_INTERACTIVE=false
if [[ "${1:-}" == "--non-interactive" ]] || [[ "${1:-}" == "-y" ]]; then
    NON_INTERACTIVE=true
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(pwd)"
CLAUDE_DIR="$PROJECT_ROOT/.claude"
HOOKS_SOURCE_DIR="$SCRIPT_DIR/hooks"
SETTINGS_SOURCE="$SCRIPT_DIR/settings.json"
BATON_PROJECT_FILE="$PROJECT_ROOT/.baton-project"

# Print functions
print_header() {
    echo -e "${PURPLE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║                                                              ║${NC}"
    echo -e "${PURPLE}║           Claude Code + Baton Integration Setup             ║${NC}"
    echo -e "${PURPLE}║                                                              ║${NC}"
    echo -e "${PURPLE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo -e "${CYAN}📋 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Function to check prerequisites
check_prerequisites() {
    print_step "Checking prerequisites..."
    
    # Check if we're in a Baton project directory
    local is_baton_project=false
    
    if [[ -f ".baton-project" ]]; then
        is_baton_project=true
    fi
    
    if [[ "$is_baton_project" == "false" ]]; then
        print_warning "This doesn't appear to be a Baton project directory"
        if [[ "$NON_INTERACTIVE" == "true" ]]; then
            print_info "Non-interactive mode: continuing anyway"
        else
            print_info "Continue anyway? (y/N): "
            read -r response
            if [[ ! "$response" =~ ^[Yy]$ ]]; then
                print_error "Setup cancelled"
                exit 1
            fi
        fi
    fi
    
    # Check for required tools
    local missing_tools=()
    
    if ! command -v jq >/dev/null 2>&1; then
        missing_tools+=("jq")
    fi
    
    if ! command -v curl >/dev/null 2>&1; then
        missing_tools+=("curl")
    fi
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        print_error "Missing required tools: ${missing_tools[*]}"
        print_info "Install them with: sudo apt-get install ${missing_tools[*]} (Ubuntu/Debian)"
        print_info "Or: brew install ${missing_tools[*]} (macOS)"
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Function to setup Claude directory structure
setup_claude_directory() {
    print_step "Setting up Claude Code directory structure..."
    
    # Create .claude directory if it doesn't exist
    mkdir -p "$CLAUDE_DIR"
    
    # Create subdirectories
    mkdir -p "$CLAUDE_DIR/hooks"
    mkdir -p "$CLAUDE_DIR/logs"
    mkdir -p "$CLAUDE_DIR/cache"
    
    print_success "Claude directory structure created"
}

# Function to install hook scripts
install_hooks() {
    print_step "Installing hook scripts..."
    
    if [[ ! -d "$HOOKS_SOURCE_DIR" ]]; then
        print_error "Hook source directory not found: $HOOKS_SOURCE_DIR"
        exit 1
    fi
    
    # Copy hook scripts
    local hooks_installed=0
    for hook_file in "$HOOKS_SOURCE_DIR"/*.sh; do
        if [[ -f "$hook_file" ]]; then
            local hook_name=$(basename "$hook_file")
            cp "$hook_file" "$CLAUDE_DIR/hooks/"
            chmod +x "$CLAUDE_DIR/hooks/$hook_name"
            print_info "Installed: $hook_name"
            ((hooks_installed++))
        fi
    done
    
    if [[ $hooks_installed -eq 0 ]]; then
        print_error "No hook scripts found to install"
        exit 1
    fi
    
    print_success "Installed $hooks_installed hook scripts"
}

# Function to setup settings
setup_settings() {
    print_step "Configuring Claude Code settings..."
    
    local settings_file="$CLAUDE_DIR/settings.json"
    
    if [[ -f "$settings_file" ]]; then
        print_warning "Settings file already exists"
        if [[ "$NON_INTERACTIVE" == "true" ]]; then
            cp "$settings_file" "$settings_file.backup.$(date +%Y%m%d_%H%M%S)"
            print_info "Auto-backup created: $settings_file.backup.*"
        else
            print_info "Backup existing settings? (Y/n): "
            read -r response
            if [[ ! "$response" =~ ^[Nn]$ ]]; then
                cp "$settings_file" "$settings_file.backup.$(date +%Y%m%d_%H%M%S)"
                print_info "Backup created: $settings_file.backup.*"
            fi
        fi
    fi
    
    # Copy template settings
    if [[ ! -f "$SETTINGS_SOURCE" ]]; then
        print_error "Settings template not found: $SETTINGS_SOURCE"
        exit 1
    fi
    
    # Customize settings for current environment
    local backend_path="$(realpath "$PROJECT_ROOT/backend" 2>/dev/null || echo "$PROJECT_ROOT/backend")"
    
    # Update settings with actual paths
    jq --arg backend_path "$backend_path" \
       --arg project_root "$PROJECT_ROOT" \
       '.mcpServers.baton.cwd = $backend_path' \
       "$SETTINGS_SOURCE" > "$settings_file"
    
    print_success "Settings configured"
}

# Function to setup project context
setup_project_context() {
    print_step "Setting up Baton project context..."
    
    if [[ -f "$BATON_PROJECT_FILE" ]]; then
        local existing_project_id=$(jq -r '.projectId // empty' "$BATON_PROJECT_FILE" 2>/dev/null || true)
        if [[ -n "$existing_project_id" && "$existing_project_id" != "null" ]]; then
            print_info "Existing project context found: $existing_project_id"
            if [[ "$NON_INTERACTIVE" == "true" ]]; then
                print_success "Keeping existing project context"
                return 0
            else
                print_info "Keep existing project context? (Y/n): "
                read -r response
                if [[ "$response" =~ ^[Nn]$ ]]; then
                    rm "$BATON_PROJECT_FILE"
                else
                    print_success "Keeping existing project context"
                    return 0
                fi
            fi
        fi
    fi
    
    # Create initial project context
    local project_name=$(basename "$PROJECT_ROOT")
    
    if [[ "$NON_INTERACTIVE" == "true" ]]; then
        print_info "Using default project name: $project_name"
    else
        print_info "Project name (default: $project_name): "
        read -r user_project_name
        if [[ -n "$user_project_name" ]]; then
            project_name="$user_project_name"
        fi
    fi
    
    # Create project context file
    jq -n \
        --arg name "$project_name" \
        --arg setup_date "$(date -Iseconds)" \
        --arg workspace_path "$PROJECT_ROOT" \
        '{
            projectId: "",
            projectName: $name,
            setupDate: $setup_date,
            workspacePath: $workspace_path,
            autoDetected: false,
            setupByScript: true,
            note: "Project ID will be auto-detected on first Claude Code session"
        }' > "$BATON_PROJECT_FILE"
    
    print_success "Project context initialized"
}

# Function to test Baton server connection
test_baton_connection() {
    print_step "Testing Baton server connection..."
    
    local baton_url="${BATON_API_URL:-http://localhost:3001}"
    
    if curl -s "$baton_url/api/health" >/dev/null 2>&1; then
        print_success "Baton server is accessible at $baton_url"
        
        # Test MCP server connection
        local mcp_port="${BATON_MCP_PORT:-3002}"
        if curl -s "http://localhost:$mcp_port" >/dev/null 2>&1; then
            print_success "Baton MCP server is accessible on port $mcp_port"
        else
            print_warning "Baton MCP server not accessible on port $mcp_port"
            print_info "Start with: cd backend && npm run mcp:dev"
        fi
    else
        print_warning "Baton server not accessible at $baton_url"
        print_info "Start with: docker compose up -d"
    fi
}

# Function to create usage examples
create_examples() {
    print_step "Creating usage examples..."
    
    local examples_dir="$CLAUDE_DIR/examples"
    mkdir -p "$examples_dir"
    
    # Create example project configuration
    cat > "$examples_dir/example-project-config.json" << 'EOF'
{
  "projectId": "your-project-id-here",
  "projectName": "My Awesome Project",
  "autoSyncTodosToTasks": true,
  "notificationLevel": "normal",
  "webhookUrl": "https://your-webhook-url.com/baton-events",
  "customSettings": {
    "autoCreateProjectOnMissing": true,
    "defaultTaskPriority": "medium",
    "syncStrategy": "manual"
  }
}
EOF
    
    # Create example Claude Code commands
    cat > "$examples_dir/example-commands.md" << 'EOF'
# Example Claude Code Commands with Baton Integration

## Project Setup
```
# Project context is auto-detected on session start
# No manual commands needed!
```

## Plan Management
```
"Create a plan to implement user authentication"
"Break down the login feature into tasks"
"Plan the database migration workflow"
```

## Todo Management
```
"Add todos for testing the API endpoints"
"Mark the database setup todo as complete"
"Create todos for the frontend components"
```

## Synchronization
```
"Sync my todos to Baton tasks"
"Convert Baton tasks back to todos"
"Show me the current project analytics"
```

## Advanced Workflows
```
"Create a comprehensive project plan with milestones"
"Generate todos for each milestone and sync them to tasks"
"Set up automated testing workflow with todo tracking"
```
EOF
    
    print_success "Usage examples created in $examples_dir"
}

# Function to run post-setup validation
validate_setup() {
    print_step "Validating setup..."
    
    local issues=0
    
    # Check hooks are executable
    for hook in sessionStart preToolUse postToolUse userPromptSubmit; do
        local hook_file="$CLAUDE_DIR/hooks/$hook.sh"
        if [[ ! -x "$hook_file" ]]; then
            print_error "Hook not executable: $hook_file"
            ((issues++))
        fi
    done
    
    # Check settings file
    if [[ ! -f "$CLAUDE_DIR/settings.json" ]]; then
        print_error "Settings file missing: $CLAUDE_DIR/settings.json"
        ((issues++))
    elif ! jq empty "$CLAUDE_DIR/settings.json" 2>/dev/null; then
        print_error "Settings file has invalid JSON"
        ((issues++))
    fi
    
    # Check project context
    if [[ ! -f "$BATON_PROJECT_FILE" ]]; then
        print_error "Project context file missing: $BATON_PROJECT_FILE"
        ((issues++))
    fi
    
    if [[ $issues -eq 0 ]]; then
        print_success "Setup validation passed"
        return 0
    else
        print_error "Setup validation failed with $issues issues"
        return 1
    fi
}

# Function to print next steps
print_next_steps() {
    echo ""
    echo -e "${GREEN}🎉 Setup completed successfully!${NC}"
    echo ""
    echo -e "${CYAN}📋 Next Steps:${NC}"
    echo ""
    echo -e "1. ${YELLOW}Start Baton services:${NC}"
    echo -e "   ${BLUE}docker compose up -d${NC}"
    echo ""
    echo -e "2. ${YELLOW}Test the integration:${NC}"
    echo -e "   ${BLUE}claude${NC} (or your Claude Code command)"
    echo -e "   Say: ${GREEN}\"Create a plan to implement a new feature\"${NC}"
    echo ""
    echo -e "3. ${YELLOW}Check the logs:${NC}"
    echo -e "   ${BLUE}tail -f .claude/baton-session.log${NC}"
    echo ""
    echo -e "4. ${YELLOW}Explore examples:${NC}"
    echo -e "   ${BLUE}cat .claude/examples/example-commands.md${NC}"
    echo ""
    echo -e "${PURPLE}✨ Features you now have:${NC}"
    echo -e "  • Automatic project detection"
    echo -e "  • Seamless plan and todo management"  
    echo -e "  • Real-time synchronization"
    echo -e "  • Context-aware workflows"
    echo -e "  • Enhanced notifications"
    echo ""
}

# Main execution
main() {
    print_header
    
    # Run setup steps
    check_prerequisites
    setup_claude_directory
    install_hooks
    setup_settings
    setup_project_context
    test_baton_connection
    create_examples
    
    # Validate setup
    if validate_setup; then
        print_next_steps
    else
        print_error "Setup completed with issues - check the validation output above"
        exit 1
    fi
}

# Error handling
trap 'print_error "Setup failed at line $LINENO"; exit 1' ERR

# Run main function
main "$@"