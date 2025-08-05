#!/bin/bash

# Manual Claude Code Agent Test
# Tests if we can manually trigger MCP tool calls

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BATON_PROJECT_FILE="$PROJECT_ROOT/.baton-project"
BACKEND_CONTAINER="baton-backend-dev"
POSTGRES_CONTAINER="baton-postgres-dev"

# Get project ID from .baton-project
PROJECT_ID=$(cat "$BATON_PROJECT_FILE" | grep -o '"projectId"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

echo -e "${BLUE}🎯 Using project ID: $PROJECT_ID${NC}"

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

# Function to count records in database
count_db_records() {
    local table=$1
    local column="project_id"
    
    # Use correct column name based on table
    if [[ "$table" == "claude_code_plans" ]]; then
        column="\"projectId\""
    fi
    
    local count=$(docker exec "$POSTGRES_CONTAINER" psql -U baton_user -d baton_dev -t -c "SELECT COUNT(*) FROM $table WHERE $column = '$PROJECT_ID';" 2>/dev/null | xargs || echo "0")
    echo "$count"
}

# Manual test function
run_manual_test() {
    print_status "INFO" "Starting manual Claude Code MCP test..."
    
    # Get initial counts
    local initial_plans=$(count_db_records "claude_code_plans")
    local initial_todos=$(count_db_records "claude_todos")
    
    print_status "INFO" "Initial counts - Plans: $initial_plans, Todos: $initial_todos"
    
    echo ""
    print_status "INFO" "Manual Test Instructions:"
    echo "1. Open a new terminal"
    echo "2. Run: claude -p"
    echo "3. Ask Claude to call the detect_workspace_project tool from baton MCP"
    echo "4. Then ask Claude to create a plan using PlanWrite tool"
    echo "5. Finally ask Claude to create todos using TodoWrite tool"
    echo ""
    
    print_status "INFO" "Example prompts to use:"
    echo ""
    echo -e "${YELLOW}Prompt 1:${NC} Can you call the detect_workspace_project tool from the baton MCP server?"
    echo ""
    echo -e "${YELLOW}Prompt 2:${NC} Can you use the PlanWrite tool to create a plan with this data:"
    echo "  plans: [{"
    echo "    id: 'test-plan-$(date +%s)',"
    echo "    title: 'Test Authentication Plan',"
    echo "    content: 'Implement user login and registration',"
    echo "    status: 'accepted'"
    echo "  }]"
    echo "  projectId: '$PROJECT_ID'"
    echo ""
    echo -e "${YELLOW}Prompt 3:${NC} Can you use the TodoWrite tool to create todos:"
    echo "  todos: [{"
    echo "    id: 'test-todo-$(date +%s)',"
    echo "    content: 'Create login form component',"
    echo "    status: 'pending',"
    echo "    priority: 'high'"
    echo "  }]"
    echo "  projectId: '$PROJECT_ID'"
    echo ""
    
    print_status "INFO" "Press any key when you've completed the manual test..."
    read -n 1 -s
    
    # Check if new data was created
    local final_plans=$(count_db_records "claude_code_plans")
    local final_todos=$(count_db_records "claude_todos")
    
    print_status "INFO" "Final counts - Plans: $final_plans, Todos: $final_todos"
    
    # Verify that data was created
    local plans_created=$((final_plans - initial_plans))
    local todos_created=$((final_todos - initial_todos))
    
    if [[ $plans_created -gt 0 ]]; then
        print_status "SUCCESS" "PlanWrite MCP tool was called successfully ($plans_created new plans)"
    else
        print_status "WARNING" "No new plans created - PlanWrite may not have been called"
    fi
    
    if [[ $todos_created -gt 0 ]]; then
        print_status "SUCCESS" "TodoWrite MCP tool was called successfully ($todos_created new todos)"
    else
        print_status "WARNING" "No new todos created - TodoWrite may not have been called"
    fi
    
    if [[ $plans_created -gt 0 ]] || [[ $todos_created -gt 0 ]]; then
        print_status "SUCCESS" "🎉 Manual test shows Baton MCP integration is working!"
        return 0
    else
        print_status "ERROR" "💥 Manual test indicates MCP tools may not be accessible"
        return 1
    fi
}

# Main execution
main() {
    echo -e "${BLUE}🚀 Claude Code Agent Manual MCP Test${NC}"
    echo ""
    
    if run_manual_test; then
        echo ""
        print_status "SUCCESS" "Manual test completed successfully"
        exit 0
    else
        echo ""
        print_status "ERROR" "Manual test failed"
        exit 1
    fi
}

# Run main function
main "$@"