#!/bin/bash

# Health Check Script for Claude Code + Baton Integration
# Comprehensive system status verification

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BATON_API_URL="${BATON_API_URL:-http://localhost:3001}"
BATON_MCP_PORT="${BATON_MCP_PORT:-3002}"

print_header() {
    echo -e "${BLUE}🔍 Claude Code + Baton Integration Health Check${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo ""
}

check_item() {
    local item="$1"
    local status="$2"
    local message="$3"
    
    if [[ "$status" == "ok" ]]; then
        echo -e "✅ ${GREEN}$item${NC}: $message"
    elif [[ "$status" == "warning" ]]; then
        echo -e "⚠️  ${YELLOW}$item${NC}: $message"
    else
        echo -e "❌ ${RED}$item${NC}: $message"
    fi
}

# Check file structure
check_file_structure() {
    echo -e "${BLUE}📁 File Structure${NC}"
    
    if [[ -d ".claude" ]]; then
        check_item "Claude Directory" "ok" ".claude/ exists"
    else
        check_item "Claude Directory" "error" ".claude/ missing - run setup.sh"
        return 1
    fi
    
    if [[ -f ".claude/settings.json" ]]; then
        if jq empty ".claude/settings.json" 2>/dev/null; then
            check_item "Settings File" "ok" "Valid JSON configuration"
        else
            check_item "Settings File" "error" "Invalid JSON in settings.json"
        fi
    else
        check_item "Settings File" "error" "settings.json missing"
    fi
    
    if [[ -f ".baton-project" ]]; then
        if jq empty ".baton-project" 2>/dev/null; then
            local project_id=$(jq -r '.projectId // empty' ".baton-project" 2>/dev/null || true)
            if [[ -n "$project_id" && "$project_id" != "null" ]]; then
                check_item "Project Context" "ok" "Project ID: $project_id"
            else
                check_item "Project Context" "warning" "Project ID not set"
            fi
        else
            check_item "Project Context" "error" "Invalid JSON in .baton-project"
        fi
    else
        check_item "Project Context" "warning" ".baton-project missing - will be auto-created"
    fi
    
    echo ""
}

# Check hook scripts
check_hooks() {
    echo -e "${BLUE}🔧 Hook Scripts${NC}"
    
    local hooks=("sessionStart.sh" "preToolUse.sh" "postToolUse.sh" "userPromptSubmit.sh")
    local hooks_ok=0
    
    for hook in "${hooks[@]}"; do
        local hook_path=".claude/hooks/$hook"
        if [[ -f "$hook_path" ]]; then
            if [[ -x "$hook_path" ]]; then
                check_item "$hook" "ok" "Installed and executable"
                ((hooks_ok++))
            else
                check_item "$hook" "error" "Not executable - run chmod +x $hook_path"
            fi
        else
            check_item "$hook" "error" "Missing - run setup.sh"
        fi
    done
    
    if [[ $hooks_ok -eq ${#hooks[@]} ]]; then
        check_item "All Hooks" "ok" "$hooks_ok/${#hooks[@]} hooks ready"
    else
        check_item "All Hooks" "error" "Only $hooks_ok/${#hooks[@]} hooks ready"
    fi
    
    echo ""
}

# Check system dependencies
check_dependencies() {
    echo -e "${BLUE}🛠️  System Dependencies${NC}"
    
    local tools=("jq" "curl" "node" "docker")
    local tools_ok=0
    
    for tool in "${tools[@]}"; do
        if command -v "$tool" >/dev/null 2>&1; then
            local version=$(eval "${tool} --version 2>/dev/null | head -1" || echo "unknown")
            check_item "$tool" "ok" "Available ($version)"
            ((tools_ok++))
        else
            check_item "$tool" "error" "Not found - install $tool"
        fi
    done
    
    echo ""
}

# Check Baton services
check_baton_services() {
    echo -e "${BLUE}🚀 Baton Services${NC}"
    
    # Check main API
    if curl -s "$BATON_API_URL/api/health" >/dev/null 2>&1; then
        check_item "Baton API" "ok" "Accessible at $BATON_API_URL"
        
        # Check database connection
        local db_status=$(curl -s "$BATON_API_URL/api/health" | jq -r '.database // "unknown"' 2>/dev/null || echo "unknown")
        if [[ "$db_status" == "connected" ]]; then
            check_item "Database" "ok" "Connected"
        else
            check_item "Database" "warning" "Status: $db_status"
        fi
        
    else
        check_item "Baton API" "error" "Not accessible - run docker compose up -d"
    fi
    
    # Check MCP server
    if curl -s "http://localhost:$BATON_MCP_PORT" >/dev/null 2>&1; then
        check_item "MCP Server" "ok" "Accessible on port $BATON_MCP_PORT"
    else
        check_item "MCP Server" "error" "Not accessible on port $BATON_MCP_PORT"
    fi
    
    # Check Docker containers
    if command -v docker >/dev/null 2>&1; then
        local running_containers=$(docker ps --format "table {{.Names}}" | grep -E "(baton|postgres)" | wc -l)
        if [[ $running_containers -gt 0 ]]; then
            check_item "Docker Containers" "ok" "$running_containers Baton containers running"
        else
            check_item "Docker Containers" "warning" "No Baton containers running"
        fi
    fi
    
    echo ""
}

# Test hook execution
test_hooks() {
    echo -e "${BLUE}🧪 Hook Execution Tests${NC}"
    
    # Test SessionStart
    if [[ -x ".claude/hooks/sessionStart.sh" ]]; then
        if timeout 10s ./.claude/hooks/sessionStart.sh >/dev/null 2>&1; then
            check_item "SessionStart Hook" "ok" "Executes successfully"
        else
            check_item "SessionStart Hook" "warning" "Execution failed or timed out"
        fi
    fi
    
    # Test PreToolUse
    if [[ -x ".claude/hooks/preToolUse.sh" ]]; then
        if timeout 5s ./.claude/hooks/preToolUse.sh "mcp__baton__TodoRead" "{}" >/dev/null 2>&1; then
            check_item "PreToolUse Hook" "ok" "Executes successfully"
        else
            check_item "PreToolUse Hook" "warning" "Execution failed or timed out"
        fi
    fi
    
    # Test PostToolUse
    if [[ -x ".claude/hooks/postToolUse.sh" ]]; then
        if timeout 5s ./.claude/hooks/postToolUse.sh "mcp__baton__TodoWrite" '{"success":true}' >/dev/null 2>&1; then
            check_item "PostToolUse Hook" "ok" "Executes successfully"
        else
            check_item "PostToolUse Hook" "warning" "Execution failed or timed out"
        fi
    fi
    
    echo ""
}

# Check logs
check_logs() {
    echo -e "${BLUE}📄 Log Analysis${NC}"
    
    local log_file=".claude/baton-session.log"
    
    if [[ -f "$log_file" ]]; then
        local log_size=$(stat -f%z "$log_file" 2>/dev/null || stat -c%s "$log_file" 2>/dev/null || echo "0")
        local recent_entries=$(tail -10 "$log_file" 2>/dev/null | wc -l)
        
        check_item "Session Log" "ok" "Size: ${log_size} bytes, Recent entries: $recent_entries"
        
        # Check for errors in recent logs
        local recent_errors=$(tail -50 "$log_file" 2>/dev/null | grep -i error | wc -l)
        if [[ $recent_errors -eq 0 ]]; then
            check_item "Log Errors" "ok" "No recent errors"
        else
            check_item "Log Errors" "warning" "$recent_errors recent error(s) found"
        fi
        
    else
        check_item "Session Log" "warning" "No log file - hooks haven't run yet"
    fi
    
    echo ""
}

# Check Claude Code configuration
check_claude_config() {
    echo -e "${BLUE}⚙️  Claude Code Configuration${NC}"
    
    if command -v claude >/dev/null 2>&1; then
        check_item "Claude Code CLI" "ok" "Available"
        
        # Check if claude can read our settings
        if claude config list >/dev/null 2>&1; then
            check_item "Claude Config" "ok" "Accessible"
        else
            check_item "Claude Config" "warning" "May not be accessible"
        fi
        
    else
        check_item "Claude Code CLI" "error" "Not found - install Claude Code"
    fi
    
    echo ""
}

# Generate summary report
generate_summary() {
    echo -e "${BLUE}📊 Health Check Summary${NC}"
    echo -e "${BLUE}========================${NC}"
    
    # Count status items from the full output
    local total_checks=$(check_file_structure; check_hooks; check_dependencies; check_baton_services; test_hooks; check_logs; check_claude_config) 2>&1 | grep -E "^(✅|⚠️|❌)" | wc -l
    local ok_checks=$(check_file_structure; check_hooks; check_dependencies; check_baton_services; test_hooks; check_logs; check_claude_config) 2>&1 | grep "^✅" | wc -l
    local warning_checks=$(check_file_structure; check_hooks; check_dependencies; check_baton_services; test_hooks; check_logs; check_claude_config) 2>&1 | grep "^⚠️" | wc -l
    local error_checks=$(check_file_structure; check_hooks; check_dependencies; check_baton_services; test_hooks; check_logs; check_claude_config) 2>&1 | grep "^❌" | wc -l
    
    echo -e "Total Checks: $total_checks"
    echo -e "✅ Passed: $ok_checks"
    echo -e "⚠️  Warnings: $warning_checks" 
    echo -e "❌ Errors: $error_checks"
    echo ""
    
    if [[ $error_checks -eq 0 ]]; then
        if [[ $warning_checks -eq 0 ]]; then
            echo -e "${GREEN}🎉 All systems operational!${NC}"
        else
            echo -e "${YELLOW}⚠️  System mostly healthy with minor warnings${NC}"
        fi
    else
        echo -e "${RED}❌ Issues detected - see TROUBLESHOOTING.md${NC}"
    fi
    
    echo ""
    echo -e "${BLUE}💡 Next Steps:${NC}"
    if [[ $error_checks -gt 0 ]]; then
        echo -e "1. Fix errors using TROUBLESHOOTING.md"
        echo -e "2. Re-run health check: ./claude-code-integration/debug/health-check.sh"
    else
        echo -e "1. Test integration: claude"
        echo -e "2. Try: 'Create a plan to implement feature X'"
        echo -e "3. Check logs: tail -f .claude/baton-session.log"
    fi
}

# Main execution
main() {
    print_header
    check_file_structure
    check_hooks
    check_dependencies  
    check_baton_services
    test_hooks
    check_logs
    check_claude_config
    generate_summary
}

# Run health check
main "$@"