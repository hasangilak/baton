#!/bin/bash

# Baton MCP Server Monitoring & Debugging Script
# Provides comprehensive monitoring and diagnostics for MCP server connectivity with Claude Code

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_ROOT/_debug/mcp-monitor-$(date +%Y%m%d-%H%M%S).log"
VERBOSE=false
EXPORT_LOGS=false
CONTINUOUS_MODE=false
TEST_CLAUDE=false

# Service endpoints
BACKEND_URL="http://localhost:3001"
MCP_SSE_URL="http://localhost:3001/mcp/sse"
MCP_WEBSOCKET_URL="ws://localhost:3002"
MCP_MESSAGES_URL="http://localhost:3001/mcp/messages"

# Docker container names
BACKEND_CONTAINER="baton-backend-dev"
MCP_CONTAINER="baton-mcp-server-dev"
POSTGRES_CONTAINER="baton-postgres-dev"
FRONTEND_CONTAINER="baton-frontend-dev"

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $status in
        "SUCCESS") echo -e "[$timestamp] ${GREEN}✅ $message${NC}" ;;
        "ERROR") echo -e "[$timestamp] ${RED}❌ $message${NC}" ;;
        "WARNING") echo -e "[$timestamp] ${YELLOW}⚠️  $message${NC}" ;;
        "INFO") echo -e "[$timestamp] ${BLUE}ℹ️  $message${NC}" ;;
        "DEBUG") [[ $VERBOSE == true ]] && echo -e "[$timestamp] ${PURPLE}🔍 $message${NC}" ;;
    esac
    
    if [[ $EXPORT_LOGS == true ]]; then
        echo "[$timestamp] [$status] $message" >> "$LOG_FILE"
    fi
}

# Function to check if Docker is running
check_docker() {
    print_status "INFO" "Checking Docker availability..."
    
    if ! command -v docker &> /dev/null; then
        print_status "ERROR" "Docker is not installed or not in PATH"
        return 1
    fi
    
    if ! docker info &> /dev/null; then
        print_status "ERROR" "Docker daemon is not running"
        return 1
    fi
    
    print_status "SUCCESS" "Docker is running"
    return 0
}

# Function to check Docker service health
check_docker_services() {
    print_status "INFO" "Checking Docker services health..."
    
    local services=($BACKEND_CONTAINER $MCP_CONTAINER $POSTGRES_CONTAINER $FRONTEND_CONTAINER)
    local all_healthy=true
    
    for container in "${services[@]}"; do
        if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "^$container"; then
            local status=$(docker ps --format "{{.Status}}" --filter "name=$container")
            if [[ $status == *"Up"* ]]; then
                print_status "SUCCESS" "$container: $status"
                
                # Check container logs for errors
                local error_count=$(docker logs "$container" --since 1m 2>&1 | grep -i "error\|failed\|exception" | wc -l)
                if [[ $error_count -gt 0 ]]; then
                    print_status "WARNING" "$container: $error_count errors in last minute"
                    if [[ $VERBOSE == true ]]; then
                        print_status "DEBUG" "Recent errors from $container:"
                        docker logs "$container" --since 1m 2>&1 | grep -i "error\|failed\|exception" | tail -5
                    fi
                fi
            else
                print_status "ERROR" "$container: $status"
                all_healthy=false
            fi
        else
            print_status "ERROR" "$container: Not running"
            all_healthy=false
        fi
    done
    
    if [[ $all_healthy == true ]]; then
        print_status "SUCCESS" "All Docker services are healthy"
        return 0
    else
        print_status "ERROR" "Some Docker services have issues"
        return 1
    fi
}

# Function to test network connectivity
test_network_connectivity() {
    print_status "INFO" "Testing network connectivity..."
    
    # Test basic backend health
    if curl -s --connect-timeout 5 "$BACKEND_URL/health" > /dev/null; then
        print_status "SUCCESS" "Backend health endpoint accessible"
    else
        print_status "ERROR" "Backend health endpoint not accessible"
        return 1
    fi
    
    # Test MCP SSE endpoint
    print_status "INFO" "Testing MCP SSE endpoint..."
    local sse_response=$(curl -s -I --connect-timeout 5 "$MCP_SSE_URL" 2>/dev/null || echo "FAILED")
    
    if [[ $sse_response == "FAILED" ]]; then
        print_status "ERROR" "MCP SSE endpoint not responding"
    elif echo "$sse_response" | grep -q "200 OK"; then
        print_status "SUCCESS" "MCP SSE endpoint responding (HTTP 200)"
        
        # Check SSE headers
        if echo "$sse_response" | grep -qi "text/event-stream"; then
            print_status "SUCCESS" "SSE content-type header present"
        else
            print_status "WARNING" "SSE content-type header missing"
        fi
        
        if echo "$sse_response" | grep -qi "cache-control.*no-cache"; then
            print_status "SUCCESS" "SSE cache-control header correct"
        else
            print_status "WARNING" "SSE cache-control header missing/incorrect"
        fi
    else
        print_status "WARNING" "MCP SSE endpoint responding with non-200 status"
        if [[ $VERBOSE == true ]]; then
            print_status "DEBUG" "SSE response headers: $sse_response"
        fi
    fi
    
    # Test CORS headers
    local cors_response=$(curl -s -H "Origin: http://localhost:5173" -I --connect-timeout 5 "$BACKEND_URL/health" 2>/dev/null || echo "FAILED")
    if [[ $cors_response != "FAILED" ]] && echo "$cors_response" | grep -qi "access-control-allow-origin"; then
        print_status "SUCCESS" "CORS headers present"
    else
        print_status "WARNING" "CORS headers missing or incorrect"
    fi
    
    return 0
}

# Function to test MCP protocol
test_mcp_protocol() {
    print_status "INFO" "Testing MCP protocol compliance..."
    
    # Create temporary test file
    local test_payload=$(cat <<'EOF'
{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {
            "name": "baton-monitor",
            "version": "1.0.0"
        }
    }
}
EOF
)
    
    # Test STDIO transport
    print_status "INFO" "Testing STDIO transport..."
    local stdio_result=$(echo "$test_payload" | docker exec -i "$BACKEND_CONTAINER" npm run mcp:stdio 2>/dev/null || echo "FAILED")
    
    if [[ $stdio_result == "FAILED" ]]; then
        print_status "ERROR" "STDIO transport failed"
    elif echo "$stdio_result" | grep -q '"jsonrpc":"2.0"'; then
        print_status "SUCCESS" "STDIO transport responding with valid JSON-RPC"
        if echo "$stdio_result" | grep -q '"result"'; then
            print_status "SUCCESS" "STDIO initialize method successful"
        else
            print_status "WARNING" "STDIO initialize method returned error"
            if [[ $VERBOSE == true ]]; then
                print_status "DEBUG" "STDIO response: $stdio_result"
            fi
        fi
    else
        print_status "WARNING" "STDIO transport responding with invalid JSON-RPC"
        if [[ $VERBOSE == true ]]; then
            print_status "DEBUG" "STDIO response: $stdio_result"
        fi
    fi
    
    # Test SSE transport with actual connection
    print_status "INFO" "Testing SSE transport connection..."
    local sse_test=$(timeout 10s curl -s -N -H "Accept: text/event-stream" "$MCP_SSE_URL" 2>/dev/null | head -5 || echo "TIMEOUT")
    
    if [[ $sse_test == "TIMEOUT" ]]; then
        print_status "WARNING" "SSE connection timed out"
    elif [[ -n $sse_test ]]; then
        print_status "SUCCESS" "SSE transport established connection"
        if [[ $VERBOSE == true ]]; then
            print_status "DEBUG" "SSE initial data: ${sse_test:0:100}..."
        fi
    else
        print_status "ERROR" "SSE transport failed to establish connection"
    fi
    
    return 0
}

# Function to test database connectivity
test_database_connectivity() {
    print_status "INFO" "Testing database connectivity..."
    
    # Test PostgreSQL connection
    local db_test=$(docker exec "$POSTGRES_CONTAINER" psql -U baton_user -d baton_dev -c "SELECT 1;" 2>/dev/null || echo "FAILED")
    
    if [[ $db_test == "FAILED" ]]; then
        print_status "ERROR" "Database connection failed"
        return 1
    else
        print_status "SUCCESS" "Database connection successful"
    fi
    
    # Test basic table queries
    local project_count=$(docker exec "$POSTGRES_CONTAINER" psql -U baton_user -d baton_dev -t -c "SELECT COUNT(*) FROM projects;" 2>/dev/null | xargs || echo "0")
    local task_count=$(docker exec "$POSTGRES_CONTAINER" psql -U baton_user -d baton_dev -t -c "SELECT COUNT(*) FROM tasks;" 2>/dev/null | xargs || echo "0")
    local todo_count=$(docker exec "$POSTGRES_CONTAINER" psql -U baton_user -d baton_dev -t -c "SELECT COUNT(*) FROM claude_todos;" 2>/dev/null | xargs || echo "0")
    
    print_status "INFO" "Database records: $project_count projects, $task_count tasks, $todo_count claude_todos"
    
    return 0
}

# Function to monitor real-time logs
monitor_realtime_logs() {
    print_status "INFO" "Starting real-time log monitoring (Press Ctrl+C to stop)..."
    
    # Create a trap to handle cleanup
    trap 'print_status "INFO" "Stopping log monitoring..."; exit 0' INT
    
    # Monitor logs from multiple containers in parallel
    {
        docker logs -f "$BACKEND_CONTAINER" 2>&1 | sed "s/^/[${CYAN}BACKEND${NC}] /" &
        docker logs -f "$MCP_CONTAINER" 2>&1 | sed "s/^/[${PURPLE}MCP${NC}] /" &
        wait
    }
}

# Function to run Claude Code specific tests
test_claude_integration() {
    print_status "INFO" "Running Claude Code integration tests..."
    
    # Check if Claude Code is available
    if ! command -v claude &> /dev/null; then
        print_status "WARNING" "Claude Code CLI not found in PATH"
        return 1
    fi
    
    # List registered MCP servers
    print_status "INFO" "Checking registered MCP servers..."
    local mcp_list=$(claude mcp list 2>/dev/null || echo "FAILED")
    
    if [[ $mcp_list == "FAILED" ]]; then
        print_status "ERROR" "Failed to list MCP servers"
        return 1
    fi
    
    if echo "$mcp_list" | grep -q "baton.*Failed to connect"; then
        print_status "ERROR" "Baton MCP server failed to connect in Claude Code"
        print_status "INFO" "Suggestion: Try re-adding the MCP server with: claude mcp add baton --transport sse $MCP_SSE_URL"
    elif echo "$mcp_list" | grep -q "baton.*Connected"; then
        print_status "SUCCESS" "Baton MCP server connected in Claude Code"
    else
        print_status "WARNING" "Baton MCP server not found in Claude Code registration"
        print_status "INFO" "Suggestion: Add the MCP server with: claude mcp add baton --transport sse $MCP_SSE_URL"
    fi
    
    if [[ $VERBOSE == true ]]; then
        print_status "DEBUG" "Full MCP server list:"
        echo "$mcp_list"
    fi
    
    return 0
}

# Function to export comprehensive logs
export_diagnostic_logs() {
    print_status "INFO" "Exporting diagnostic logs to $LOG_FILE"
    
    echo "=== Baton MCP Server Diagnostic Report ===" >> "$LOG_FILE"
    echo "Generated: $(date)" >> "$LOG_FILE"
    echo "Project Root: $PROJECT_ROOT" >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
    
    echo "=== Docker Status ===" >> "$LOG_FILE"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" >> "$LOG_FILE" 2>&1
    echo "" >> "$LOG_FILE"
    
    echo "=== Backend Logs (Last 50 lines) ===" >> "$LOG_FILE"
    docker logs --tail 50 "$BACKEND_CONTAINER" >> "$LOG_FILE" 2>&1
    echo "" >> "$LOG_FILE"
    
    echo "=== MCP Server Logs (Last 50 lines) ===" >> "$LOG_FILE"
    docker logs --tail 50 "$MCP_CONTAINER" >> "$LOG_FILE" 2>&1
    echo "" >> "$LOG_FILE"
    
    echo "=== PostgreSQL Logs (Last 20 lines) ===" >> "$LOG_FILE"
    docker logs --tail 20 "$POSTGRES_CONTAINER" >> "$LOG_FILE" 2>&1
    echo "" >> "$LOG_FILE"
    
    print_status "SUCCESS" "Diagnostic logs exported to $LOG_FILE"
}

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

MCP Server Monitoring & Debugging Script for Baton

OPTIONS:
    --mode MODE         Set monitoring mode: continuous|once|interactive (default: once)
    --verbose          Enable verbose debug output
    --export-logs      Export diagnostic logs to file
    --test-claude      Run Claude Code specific integration tests
    --help             Show this help message

EXAMPLES:
    $0                           # Run basic diagnostics once
    $0 --mode continuous         # Monitor continuously with real-time logs
    $0 --verbose --export-logs   # Detailed diagnostics with log export
    $0 --test-claude             # Test Claude Code integration
    $0 --mode interactive        # Interactive menu-driven mode

EOF
}

# Function for interactive mode
interactive_mode() {
    while true; do
        echo ""
        echo -e "${WHITE}=== Baton MCP Server Monitor ===${NC}"
        echo "1. Run basic diagnostics"
        echo "2. Check Docker services"
        echo "3. Test network connectivity"
        echo "4. Test MCP protocol"
        echo "5. Test database connectivity"
        echo "6. Monitor real-time logs"
        echo "7. Test Claude Code integration"
        echo "8. Export diagnostic logs"
        echo "9. Exit"
        echo ""
        read -p "Select option (1-9): " choice
        
        case $choice in
            1) run_basic_diagnostics ;;
            2) check_docker_services ;;
            3) test_network_connectivity ;;
            4) test_mcp_protocol ;;
            5) test_database_connectivity ;;
            6) monitor_realtime_logs ;;
            7) test_claude_integration ;;
            8) export_diagnostic_logs ;;
            9) echo "Goodbye!"; exit 0 ;;
            *) echo "Invalid option. Please try again." ;;
        esac
        
        if [[ $choice != "6" ]]; then
            echo ""
            read -p "Press Enter to continue..."
        fi
    done
}

# Function to run basic diagnostics
run_basic_diagnostics() {
    print_status "INFO" "Starting Baton MCP Server diagnostics..."
    
    check_docker || return 1
    check_docker_services
    test_network_connectivity
    test_mcp_protocol
    test_database_connectivity
    
    if [[ $TEST_CLAUDE == true ]]; then
        test_claude_integration
    fi
    
    print_status "SUCCESS" "Diagnostics completed"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --mode)
            case $2 in
                continuous) CONTINUOUS_MODE=true ;;
                once) CONTINUOUS_MODE=false ;;
                interactive) 
                    interactive_mode
                    exit 0
                    ;;
                *) echo "Invalid mode: $2"; show_usage; exit 1 ;;
            esac
            shift 2
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --export-logs)
            EXPORT_LOGS=true
            shift
            ;;
        --test-claude)
            TEST_CLAUDE=true
            shift
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

# Create debug directory if it doesn't exist
mkdir -p "$PROJECT_ROOT/_debug"

# Main execution
if [[ $CONTINUOUS_MODE == true ]]; then
    print_status "INFO" "Starting continuous monitoring mode..."
    while true; do
        run_basic_diagnostics
        echo ""
        print_status "INFO" "Waiting 30 seconds before next check..."
        sleep 30
    done
else
    run_basic_diagnostics
    
    if [[ $EXPORT_LOGS == true ]]; then
        export_diagnostic_logs
    fi
fi