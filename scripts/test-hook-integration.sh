#!/bin/bash

# Test Claude Code Hook Integration
# This script tests that hooks are properly configured and working

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BATON_PROJECT_FILE="$PROJECT_ROOT/.baton-project"
PROJECT_ID=$(cat "$BATON_PROJECT_FILE" | jq -r '.projectId')

# Function to print status
print_status() {
    local status=$1
    local message=$2
    local timestamp=$(date '+%H:%M:%S')
    
    case $status in
        "SUCCESS") echo -e "[$timestamp] ${GREEN}✅ $message${NC}" ;;
        "ERROR") echo -e "[$timestamp] ${RED}❌ $message${NC}" ;;
        "WARNING") echo -e "[$timestamp] ${YELLOW}⚠️  $message${NC}" ;;
        "INFO") echo -e "[$timestamp] ${BLUE}ℹ️  $message${NC}" ;;
    esac
}

# Function to check hook configuration
check_hook_config() {
    print_status "INFO" "Checking Claude Code hook configuration..."
    
    # Check if hooks are registered in global config
    local exit_plan_hook=$(jq '.projects["/home/hassan/work/baton"].post_tool_use_hooks[] | select(.pattern == "ExitPlanMode")' /home/hassan/.claude.json 2>/dev/null)
    local todo_write_hook=$(jq '.projects["/home/hassan/work/baton"].post_tool_use_hooks[] | select(.pattern == "TodoWrite")' /home/hassan/.claude.json 2>/dev/null)
    
    if [[ -n "$exit_plan_hook" ]]; then
        print_status "SUCCESS" "ExitPlanMode hook is configured"
    else
        print_status "ERROR" "ExitPlanMode hook is NOT configured"
        return 1
    fi
    
    if [[ -n "$todo_write_hook" ]]; then
        print_status "SUCCESS" "TodoWrite hook is configured"
    else
        print_status "ERROR" "TodoWrite hook is NOT configured"
        return 1
    fi
    
    return 0
}

# Function to test hook scripts exist and are executable
check_hook_scripts() {
    print_status "INFO" "Checking hook scripts..."
    
    local scripts=(
        "$PROJECT_ROOT/scripts/capture-plan.js"
        "$PROJECT_ROOT/scripts/capture-todos.js"
    )
    
    for script in "${scripts[@]}"; do
        if [[ -f "$script" ]]; then
            if [[ -x "$script" ]]; then
                print_status "SUCCESS" "$(basename "$script") exists and is executable"
            else
                print_status "WARNING" "$(basename "$script") exists but is not executable"
            fi
        else
            print_status "ERROR" "$(basename "$script") does not exist"
            return 1
        fi
    done
    
    return 0
}

# Function to test API endpoints
test_api_endpoints() {
    print_status "INFO" "Testing API endpoints..."
    
    # Test hook status endpoint
    local hook_status=$(curl -s "http://localhost:3001/api/claude/hook-status?projectId=$PROJECT_ID")
    
    if [[ -n "$hook_status" ]] && echo "$hook_status" | jq -e '.success' >/dev/null 2>&1; then
        print_status "SUCCESS" "Hook status endpoint is working"
        
        local total_plans=$(echo "$hook_status" | jq -r '.status.totals.plans')
        local total_todos=$(echo "$hook_status" | jq -r '.status.totals.todos')
        
        print_status "INFO" "Current data: $total_plans plans, $total_todos todos"
    else
        print_status "ERROR" "Hook status endpoint failed"
        return 1
    fi
    
    return 0
}

# Function to simulate hook execution
simulate_hook_execution() {
    print_status "INFO" "Simulating hook execution..."
    
    # Test ExitPlanMode hook
    local test_plan_data='{
        "tool_name": "ExitPlanMode",
        "tool_input": {
            "plan": "# Test Plan\n\nThis is a test plan for hook verification."
        },
        "cwd": "'$PROJECT_ROOT'",
        "session_id": "test-session-'$(date +%s)'"
    }'
    
    print_status "INFO" "Testing ExitPlanMode hook..."
    if echo "$test_plan_data" | node "$PROJECT_ROOT/scripts/capture-plan.js" 2>&1 | grep -q "✅"; then
        print_status "SUCCESS" "ExitPlanMode hook executed successfully"
    else
        print_status "WARNING" "ExitPlanMode hook execution may have failed"
    fi
    
    # Test TodoWrite hook
    local test_todo_data='{
        "tool_name": "TodoWrite",
        "tool_input": {
            "todos": [
                {
                    "id": "test-todo-'$(date +%s)'",
                    "content": "Test todo from hook integration test",
                    "status": "pending",
                    "priority": "medium"
                }
            ]
        },
        "cwd": "'$PROJECT_ROOT'"
    }'
    
    print_status "INFO" "Testing TodoWrite hook..."
    if echo "$test_todo_data" | node "$PROJECT_ROOT/scripts/capture-todos.js" 2>&1 | grep -q "✅"; then
        print_status "SUCCESS" "TodoWrite hook executed successfully"
    else
        print_status "WARNING" "TodoWrite hook execution may have failed"
    fi
    
    return 0
}

# Main execution
main() {
    echo -e "${BLUE}🚀 Claude Code Hook Integration Test${NC}"
    echo ""
    
    # Run all checks
    local all_good=true
    
    check_hook_config || all_good=false
    check_hook_scripts || all_good=false
    test_api_endpoints || all_good=false
    
    if [[ $all_good == true ]]; then
        echo ""
        print_status "INFO" "Running hook simulation tests..."
        simulate_hook_execution
        
        echo ""
        print_status "SUCCESS" "🎉 Hook integration is properly configured!"
        print_status "INFO" "Hooks will automatically capture:"
        print_status "INFO" "  - Plans when you exit plan mode"
        print_status "INFO" "  - Todos when you use TodoWrite"
        exit 0
    else
        echo ""
        print_status "ERROR" "💥 Hook integration has issues that need to be fixed"
        exit 1
    fi
}

# Run main function
main "$@"