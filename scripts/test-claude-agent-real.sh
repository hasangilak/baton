#!/bin/bash

# Claude Code Agent E2E Test
# Tests real Claude Code agent with Baton MCP integration

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
TEST_TIMEOUT=60

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

# Function to ensure Baton MCP is registered
ensure_baton_mcp() {
    print_status "INFO" "Ensuring Baton MCP server is registered..."
    
    # Check if baton MCP is already registered
    local mcp_list=$(claude mcp list 2>/dev/null || echo "FAILED")
    
    if [[ $mcp_list == "FAILED" ]]; then
        print_status "ERROR" "Could not list MCP servers"
        return 1
    fi
    
    # Remove existing baton MCP if present
    if echo "$mcp_list" | grep -q "baton"; then
        print_status "INFO" "Removing existing Baton MCP server..."
        claude mcp remove baton 2>/dev/null || true
    fi
    
    # Add Baton MCP server
    print_status "INFO" "Adding Baton MCP server..."
    if ! claude mcp add baton --transport sse "$MCP_URL" 2>/dev/null; then
        print_status "ERROR" "Failed to add Baton MCP server"
        return 1
    fi
    
    # Verify it was added successfully
    sleep 2
    local updated_list=$(claude mcp list 2>/dev/null || echo "FAILED")
    if [[ $updated_list == "FAILED" ]] || ! echo "$updated_list" | grep -q "baton.*Connected"; then
        print_status "ERROR" "Baton MCP server not connected properly"
        return 1
    fi
    
    print_status "SUCCESS" "Baton MCP server registered and connected"
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

# Function to run Claude Code agent test with interactive simulation
run_claude_agent_test() {
    print_status "INFO" "Starting Claude Code agent test..."
    
    # Get initial counts
    local initial_plans=$(count_db_records "claude_code_plans")
    local initial_todos=$(count_db_records "claude_todos")
    
    print_status "INFO" "Initial counts - Plans: $initial_plans, Todos: $initial_todos"
    
    # Create a test prompt that explicitly triggers plan mode
    local test_prompt_file="/tmp/claude-test-prompt-$$.txt"
    
    cat > "$test_prompt_file" << 'EOF'
I'm building a web application and need help implementing a complete user authentication system. This should include user registration, login, password reset, and session management.

The app is built with React frontend and Node.js backend. I want to make sure it's secure and follows best practices.

Can you help me implement this feature?
EOF
    
    print_status "INFO" "Spawning Claude Code agent..."
    
    # Use expect for interactive session if available, otherwise use simple pipe
    if command -v expect &> /dev/null; then
        run_claude_with_expect "$test_prompt_file"
    else
        run_claude_simple "$test_prompt_file"
    fi
    
    local claude_exit_code=$?
    
    # Clean up temp file
    rm -f "$test_prompt_file"
    
    if [[ $claude_exit_code -ne 0 ]]; then
        print_status "ERROR" "Claude Code agent failed or timed out"
        return 1
    fi
    
    print_status "SUCCESS" "Claude Code agent completed execution"
    
    # Wait for database writes to complete
    print_status "INFO" "Waiting for MCP operations to complete..."
    sleep 5
    
    # Check if new plans were created
    local final_plans=$(count_db_records "claude_code_plans")
    local final_todos=$(count_db_records "claude_todos")
    
    print_status "INFO" "Final counts - Plans: $final_plans, Todos: $final_todos"
    
    # Verify that data was created
    local plans_created=$((final_plans - initial_plans))
    local todos_created=$((final_todos - initial_todos))
    
    if [[ $plans_created -gt 0 ]]; then
        print_status "SUCCESS" "PlanWrite MCP tool was called ($plans_created new plans)"
    else
        print_status "ERROR" "No new plans created - PlanWrite may not have been called"
        return 1
    fi
    
    if [[ $todos_created -gt 0 ]]; then
        print_status "SUCCESS" "TodoWrite MCP tool was called ($todos_created new todos)"
    else
        print_status "WARNING" "No new todos created - TodoWrite may not have been called"
        # This is a warning, not a failure, as todos might be created differently
    fi
    
    return 0
}

# Function to run Claude with expect for interactive simulation
run_claude_with_expect() {
    local prompt_file=$1
    
    expect -c "
        set timeout $TEST_TIMEOUT
        spawn claude -p
        
        # Send the initial prompt
        send_file \"$prompt_file\"
        send \"\r\"
        
        # Wait for Claude's response and look for natural plan mode triggers
        expect {
            -re \"(plan|implement|structure|approach)\" {
                # Claude is discussing planning - let it continue
                exp_continue
            }
            -re \"(Would you like|Should I|Can I).*\\?\" {
                # Claude is asking for confirmation - respond positively
                send \"yes\r\"
                exp_continue
            }
            -re \"ExitPlanMode\" {
                # Plan mode is being exited - this is what we want
                send \"yes\r\"
                exp_continue
            }
            -re \"todo\" {
                # Claude might be creating todos - let it continue
                exp_continue
            }
            timeout {
                send_user \"\\nTest completed (timeout reached)\\n\"
                exit 0
            }
            eof {
                send_user \"\\nClaude session ended naturally\\n\"
                exit 0
            }
        }
    " 2>/dev/null
    
    return $?
}

# Function to run Claude with simple pipe (fallback)
run_claude_simple() {
    local prompt_file=$1
    
    print_status "INFO" "Running Claude Code (simple mode - no expect available)..."
    
    # Create a more explicit prompt that should trigger plan mode
    local enhanced_prompt_file="/tmp/claude-enhanced-prompt-$$.txt"
    
    cat > "$enhanced_prompt_file" << 'EOF'
I'm working on a React/Node.js web application and need to add user authentication. I want to implement:

- User registration and login
- Password reset functionality  
- Session management
- Protected routes
- JWT token handling

This is a complex feature and I'd like to approach it systematically. Can you help me plan and implement this authentication system?
EOF
    
    # Run Claude with the enhanced prompt
    print_status "INFO" "Sending authentication system implementation request..."
    
    # Use a shorter timeout and capture more detailed output
    local claude_output_file="/tmp/claude-output-$$.txt"
    local claude_error_file="/tmp/claude-error-$$.txt"
    
    print_status "INFO" "Running Claude Code in project directory: $PROJECT_ROOT"
    
    # Run Claude Code in the project directory where hooks are active
    if (cd "$PROJECT_ROOT" && timeout 45 claude -p --dangerously-skip-permissions < "$enhanced_prompt_file" > "$claude_output_file" 2> "$claude_error_file"); then
        print_status "SUCCESS" "Claude Code execution completed"
        
        # Show some output for debugging
        if [[ -s "$claude_output_file" ]]; then
            print_status "INFO" "Claude output (first 10 lines):"
            head -10 "$claude_output_file" | while IFS= read -r line; do
                echo "  [CLAUDE] $line"
            done
        fi
        
        # Clean up temp files
        rm -f "$enhanced_prompt_file" "$claude_output_file" "$claude_error_file"
        return 0
    else
        local exit_code=$?
        print_status "ERROR" "Claude Code failed with exit code: $exit_code"
        
        # Show error output if available
        if [[ -s "$claude_error_file" ]]; then
            print_status "ERROR" "Claude error output:"
            head -10 "$claude_error_file" | while IFS= read -r line; do
                echo "  [ERROR] $line"
            done
        fi
        
        # Clean up temp files
        rm -f "$enhanced_prompt_file" "$claude_output_file" "$claude_error_file"
        return $exit_code
    fi
}

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Claude Code Agent E2E Test Script

OPTIONS:
    --timeout SECONDS   Set test timeout (default: $TEST_TIMEOUT)
    --help             Show this help message

EXAMPLES:
    $0                      # Run test with default settings
    $0 --timeout 120        # Run test with 2-minute timeout

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --timeout)
            TEST_TIMEOUT="$2"
            shift 2
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Main execution
main() {
    echo -e "${BLUE}🚀 Claude Code Agent E2E Test Starting...${NC}"
    echo ""
    
    # Run all checks and tests
    check_claude_cli || exit 1
    check_docker_services || exit 1
    ensure_baton_mcp || exit 1
    
    echo ""
    print_status "INFO" "Starting main test sequence..."
    echo ""
    
    if run_claude_agent_test; then
        echo ""
        print_status "SUCCESS" "🎉 All tests passed! Claude Code + Baton MCP integration is working"
        exit 0
    else
        echo ""
        print_status "ERROR" "💥 Test failed! Check the output above for details"
        exit 1
    fi
}

# Run main function
main "$@"