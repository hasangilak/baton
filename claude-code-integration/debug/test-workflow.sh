#!/bin/bash

# End-to-End Workflow Test for Claude Code + Baton Integration
# Tests the complete integration flow without requiring Claude Code

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}🧪 Claude Code + Baton Integration Workflow Test${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo ""
}

test_step() {
    local step="$1"
    local status="$2" 
    local message="$3"
    
    if [[ "$status" == "ok" ]]; then
        echo -e "✅ ${GREEN}$step${NC}: $message"
    elif [[ "$status" == "warning" ]]; then
        echo -e "⚠️  ${YELLOW}$step${NC}: $message"
    else
        echo -e "❌ ${RED}$step${NC}: $message"
    fi
}

# Test 1: SessionStart Hook
test_session_start() {
    echo -e "${BLUE}1️⃣  Testing SessionStart Hook${NC}"
    
    # Clean state
    rm -f .baton-project .claude/baton-session.log
    
    # Run SessionStart hook
    if ./.claude/hooks/sessionStart.sh >/dev/null 2>&1; then
        if [[ -f ".baton-project" ]]; then
            local project_id=$(jq -r '.projectId // empty' .baton-project 2>/dev/null || true)
            if [[ -n "$project_id" ]]; then
                test_step "SessionStart" "ok" "Project context created: $project_id"
            else
                test_step "SessionStart" "warning" "Project file created but no ID"
            fi
        else
            test_step "SessionStart" "error" "No project file created"
        fi
    else
        test_step "SessionStart" "error" "Hook execution failed"
    fi
    
    echo ""
}

# Test 2: PreToolUse Hook
test_pre_tool_use() {
    echo -e "${BLUE}2️⃣  Testing PreToolUse Hook${NC}"
    
    # Test with TodoRead
    local result=$(./.claude/hooks/preToolUse.sh "mcp__baton__TodoRead" "{}" 2>/dev/null || echo "{}")
    
    if echo "$result" | jq -e '.projectId' >/dev/null 2>&1; then
        local project_id=$(echo "$result" | jq -r '.projectId')
        test_step "ProjectId Injection" "ok" "Injected projectId: $project_id"
    else
        test_step "ProjectId Injection" "warning" "No projectId injected"
    fi
    
    # Test with non-Baton tool
    local result2=$(./.claude/hooks/preToolUse.sh "other_tool" "{\"test\":\"data\"}" 2>/dev/null || echo "{}")
    
    if [[ "$result2" == "{\"test\":\"data\"}" ]]; then
        test_step "Non-Baton Tool" "ok" "Correctly ignored non-Baton tool"
    else
        test_step "Non-Baton Tool" "warning" "Unexpected modification of non-Baton tool"
    fi
    
    echo ""
}

# Test 3: PostToolUse Hook
test_post_tool_use() {
    echo -e "${BLUE}3️⃣  Testing PostToolUse Hook${NC}"
    
    # Test with TodoWrite result
    local test_result='{"success":true,"count":3,"message":"Test todos created"}'
    
    if ./.claude/hooks/postToolUse.sh "mcp__baton__TodoWrite" "$test_result" "true" >/dev/null 2>&1; then
        test_step "PostToolUse Execution" "ok" "Hook executed successfully"
        
        # Check if sync cache was updated
        if [[ -f ".claude/baton-sync-cache.json" ]]; then
            local cache_entries=$(jq length .claude/baton-sync-cache.json 2>/dev/null || echo 0)
            test_step "Sync Cache" "ok" "Cache updated with $cache_entries entries"
        else
            test_step "Sync Cache" "warning" "Cache file not created"
        fi
    else
        test_step "PostToolUse Execution" "error" "Hook execution failed"
    fi
    
    echo ""
}

# Test 4: UserPromptSubmit Hook
test_user_prompt_submit() {
    echo -e "${BLUE}4️⃣  Testing UserPromptSubmit Hook${NC}"
    
    # Test plan creation intent
    local plan_prompt="Create a plan to implement user authentication"
    local result=$(./.claude/hooks/userPromptSubmit.sh "$plan_prompt" 2>/dev/null || echo "$plan_prompt")
    
    if [[ "$result" != "$plan_prompt" ]]; then
        if echo "$result" | grep -q "Context:"; then
            test_step "Plan Intent Detection" "ok" "Context injected for plan creation"
        else
            test_step "Plan Intent Detection" "warning" "Prompt modified but no context found"
        fi
    else
        test_step "Plan Intent Detection" "warning" "No context injection detected"
    fi
    
    # Test general prompt
    local general_prompt="What is the weather today?"
    local result2=$(./.claude/hooks/userPromptSubmit.sh "$general_prompt" 2>/dev/null || echo "$general_prompt")
    
    if [[ "$result2" == "$general_prompt" ]] || ! echo "$result2" | grep -q "Context:.*Baton"; then
        test_step "General Prompt" "ok" "General prompts handled correctly"
    else
        test_step "General Prompt" "warning" "Unexpected context injection"
    fi
    
    echo ""
}

# Test 5: Settings Validation
test_settings() {
    echo -e "${BLUE}5️⃣  Testing Settings Configuration${NC}"
    
    if [[ -f ".claude/settings.json" ]]; then
        if jq empty .claude/settings.json 2>/dev/null; then
            test_step "Settings JSON" "ok" "Valid JSON format"
            
            # Check for required sections
            local has_mcp=$(jq -e '.mcpServers.baton' .claude/settings.json >/dev/null 2>&1 && echo "true" || echo "false")
            local has_hooks=$(jq -e '.hooks' .claude/settings.json >/dev/null 2>&1 && echo "true" || echo "false")
            
            if [[ "$has_mcp" == "true" ]]; then
                test_step "MCP Configuration" "ok" "Baton MCP server configured"
            else
                test_step "MCP Configuration" "error" "Baton MCP server not configured"
            fi
            
            if [[ "$has_hooks" == "true" ]]; then
                test_step "Hooks Configuration" "ok" "Hooks section present"
            else
                test_step "Hooks Configuration" "error" "Hooks section missing"
            fi
        else
            test_step "Settings JSON" "error" "Invalid JSON format"
        fi
    else
        test_step "Settings File" "error" "Settings file missing"
    fi
    
    echo ""
}

# Test 6: Log Analysis
test_logging() {
    echo -e "${BLUE}6️⃣  Testing Logging System${NC}"
    
    if [[ -f ".claude/baton-session.log" ]]; then
        local log_lines=$(wc -l < .claude/baton-session.log)
        test_step "Log File" "ok" "$log_lines log entries created"
        
        # Check for hook entries
        local session_logs=$(grep -c "SessionStart:" .claude/baton-session.log 2>/dev/null || echo 0)
        local pretool_logs=$(grep -c "PreToolUse:" .claude/baton-session.log 2>/dev/null || echo 0)
        local posttool_logs=$(grep -c "PostToolUse:" .claude/baton-session.log 2>/dev/null || echo 0)
        
        if [[ $session_logs -gt 0 ]]; then
            test_step "SessionStart Logging" "ok" "$session_logs entries"
        else
            test_step "SessionStart Logging" "warning" "No SessionStart log entries"
        fi
        
        if [[ $pretool_logs -gt 0 ]]; then
            test_step "PreToolUse Logging" "ok" "$pretool_logs entries"
        else
            test_step "PreToolUse Logging" "warning" "No PreToolUse log entries"
        fi
        
        if [[ $posttool_logs -gt 0 ]]; then
            test_step "PostToolUse Logging" "ok" "$posttool_logs entries"
        else
            test_step "PostToolUse Logging" "warning" "No PostToolUse log entries"
        fi
    else
        test_step "Log File" "warning" "No log file created"
    fi
    
    echo ""
}

# Test 7: Integration with Baton API
test_baton_integration() {
    echo -e "${BLUE}7️⃣  Testing Baton API Integration${NC}"
    
    local baton_url="${BATON_API_URL:-http://localhost:3001}"
    
    if curl -s "$baton_url/api/health" >/dev/null 2>&1; then
        test_step "Baton API" "ok" "API accessible"
        
        # Test projects endpoint
        if curl -s "$baton_url/api/projects" >/dev/null 2>&1; then
            test_step "Projects API" "ok" "Projects endpoint accessible"
        else
            test_step "Projects API" "warning" "Projects endpoint not accessible"
        fi
        
        # Test Claude integration endpoints
        if curl -s "$baton_url/api/claude/todos" >/dev/null 2>&1; then
            test_step "Claude Endpoints" "ok" "Claude integration endpoints accessible"
        else
            test_step "Claude Endpoints" "warning" "Claude endpoints not accessible"
        fi
        
    else
        test_step "Baton API" "error" "API not accessible - start with docker compose up -d"
    fi
    
    echo ""
}

# Generate test summary
generate_test_summary() {
    echo -e "${BLUE}📊 Workflow Test Summary${NC}"
    echo -e "${BLUE}========================${NC}"
    
    # Re-run all tests and count results
    {
        test_session_start
        test_pre_tool_use
        test_post_tool_use
        test_user_prompt_submit
        test_settings
        test_logging
        test_baton_integration
    } 2>&1 | grep -E "^(✅|⚠️|❌)" > /tmp/test_results.txt
    
    local total_tests=$(wc -l < /tmp/test_results.txt)
    local passed_tests=$(grep -c "^✅" /tmp/test_results.txt || echo 0)
    local warning_tests=$(grep -c "^⚠️" /tmp/test_results.txt || echo 0)
    local failed_tests=$(grep -c "^❌" /tmp/test_results.txt || echo 0)
    
    echo -e "Total Tests: $total_tests"
    echo -e "✅ Passed: $passed_tests"
    echo -e "⚠️  Warnings: $warning_tests"
    echo -e "❌ Failed: $failed_tests"
    echo ""
    
    local success_rate=$((passed_tests * 100 / total_tests))
    
    if [[ $failed_tests -eq 0 ]]; then
        if [[ $warning_tests -eq 0 ]]; then
            echo -e "${GREEN}🎉 All workflow tests passed! ($success_rate% success rate)${NC}"
        else
            echo -e "${YELLOW}⚠️  Workflow mostly functional with minor issues ($success_rate% success rate)${NC}"
        fi
    else
        echo -e "${RED}❌ Workflow tests failed - see issues above ($success_rate% success rate)${NC}"
    fi
    
    rm -f /tmp/test_results.txt
    
    echo ""
    echo -e "${BLUE}💡 Next Steps:${NC}"
    echo -e "1. Address any failed tests"
    echo -e "2. Run health check: ./claude-code-integration/debug/health-check.sh"
    echo -e "3. Test with Claude Code: claude"
    echo -e "4. Monitor logs: tail -f .claude/baton-session.log"
}

# Main execution
main() {
    print_header
    
    # Ensure we're in the right directory
    if [[ ! -d ".claude" ]] || [[ ! -f ".claude/hooks/sessionStart.sh" ]]; then
        echo -e "${RED}❌ Please run this script from the project root with .claude/hooks installed${NC}"
        echo -e "${BLUE}Run setup first: ./claude-code-integration/setup.sh${NC}"
        exit 1
    fi
    
    # Run workflow tests
    test_session_start
    test_pre_tool_use
    test_post_tool_use
    test_user_prompt_submit
    test_settings
    test_logging
    test_baton_integration
    
    # Generate summary
    generate_test_summary
}

# Run tests
main "$@"