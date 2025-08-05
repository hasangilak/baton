#!/bin/bash

# Claude Code Agent E2E Test - DRY RUN VERSION
# Tests all prerequisites without actually running Claude agent

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
MCP_URL="http://localhost:3001/mcp/sse"
BACKEND_CONTAINER="baton-backend-dev"
POSTGRES_CONTAINER="baton-postgres-dev"

# Get project ID from .baton-project
if [[ ! -f "$BATON_PROJECT_FILE" ]]; then
    echo -e "${RED}❌ .baton-project file not found${NC}"
    exit 1
fi

PROJECT_ID=$(cat "$BATON_PROJECT_FILE" | grep -o '"projectId"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
if [[ -z "$PROJECT_ID" ]]; then
    echo -e "${RED}❌ Could not extract projectId from .baton-project${NC}"
    exit 1
fi

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

# Function to check if Claude CLI is available
check_claude_cli() {
    print_status "INFO" "Checking Claude CLI availability..."
    
    if ! command -v claude &> /dev/null; then
        print_status "ERROR" "Claude CLI not found in PATH"
        return 1
    fi
    
    # Test basic Claude CLI functionality
    if ! claude --version &> /dev/null; then
        print_status "ERROR" "Claude CLI not working properly"
        return 1
    fi
    
    print_status "SUCCESS" "Claude CLI is available"
    return 0
}

# Function to check Docker services
check_docker_services() {
    print_status "INFO" "Checking Docker services..."
    
    local services=($BACKEND_CONTAINER $POSTGRES_CONTAINER)
    
    for container in "${services[@]}"; do
        if ! docker ps --format "table {{.Names}}" | grep -q "^$container$"; then
            print_status "ERROR" "$container not running"
            return 1
        fi
    done
    
    # Test backend health
    if ! curl -s --connect-timeout 5 "http://localhost:3001/health" > /dev/null; then
        print_status "ERROR" "Backend not responding"
        return 1
    fi
    
    print_status "SUCCESS" "Docker services are healthy"
    return 0
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

# Function to check MCP server registration (read-only)
check_baton_mcp() {
    print_status "INFO" "Checking Baton MCP server registration..."
    
    # Check if baton MCP is registered
    local mcp_list=$(claude mcp list 2>/dev/null || echo "FAILED")
    
    if [[ $mcp_list == "FAILED" ]]; then
        print_status "ERROR" "Could not list MCP servers"
        return 1
    fi
    
    if echo "$mcp_list" | grep -q "baton.*Connected"; then
        print_status "SUCCESS" "Baton MCP server is registered and connected"
        return 0
    elif echo "$mcp_list" | grep -q "baton"; then
        print_status "WARNING" "Baton MCP server is registered but not connected"
        print_status "INFO" "Suggestion: Run the full test to re-register: ./scripts/test-claude-agent-real.sh"
        return 1
    else
        print_status "WARNING" "Baton MCP server not registered"
        print_status "INFO" "Suggestion: Run the full test to register: ./scripts/test-claude-agent-real.sh"
        return 1
    fi
}

# Dry run test function
run_claude_agent_dry_run() {
    print_status "INFO" "DRY RUN: Simulating Claude Code agent test..."
    
    # Get current counts
    local current_plans=$(count_db_records "claude_code_plans")
    local current_todos=$(count_db_records "claude_todos")
    
    print_status "INFO" "Current database state - Plans: $current_plans, Todos: $current_todos"
    
    print_status "INFO" "DRY RUN: Would create test prompt for user authentication system"
    print_status "INFO" "DRY RUN: Would spawn Claude Code agent with interactive session"
    print_status "INFO" "DRY RUN: Would simulate user accepting generated plan"
    print_status "INFO" "DRY RUN: Would wait for PlanWrite MCP tool to be called"
    print_status "INFO" "DRY RUN: Would wait for TodoWrite MCP tool to be called"
    print_status "INFO" "DRY RUN: Would verify new records in database"
    
    print_status "SUCCESS" "DRY RUN completed successfully"
    return 0
}

# Main execution
main() {
    echo -e "${BLUE}🚀 Claude Code Agent E2E Test - DRY RUN${NC}"
    echo ""
    
    # Run all checks (but not the actual test)
    local all_good=true
    
    check_claude_cli || all_good=false
    check_docker_services || all_good=false
    check_baton_mcp || all_good=false
    
    echo ""
    
    if [[ $all_good == true ]]; then
        print_status "INFO" "All prerequisites passed! Running dry run simulation..."
        echo ""
        
        if run_claude_agent_dry_run; then
            echo ""
            print_status "SUCCESS" "🎉 Dry run complete! System is ready for real Claude Code agent testing"
            echo ""
            print_status "INFO" "To run the actual test, use: ./scripts/test-claude-agent-real.sh"
            exit 0
        else
            echo ""
            print_status "ERROR" "💥 Dry run simulation failed"
            exit 1
        fi
    else
        echo ""
        print_status "ERROR" "💥 Prerequisites not met! Fix the issues above before running the real test"
        exit 1
    fi
}

# Run main function
main "$@"