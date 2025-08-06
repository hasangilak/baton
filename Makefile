# Baton - AI Task Management System
# Makefile for managing Claude Code integration and development workflows

# Configuration
BACKEND_URL ?= http://localhost:3001
FRONTEND_URL ?= http://localhost:5173
MCP_PORT ?= 3002
CHAT_HANDLER_LOG ?= /tmp/baton-chat-handler.log
BRIDGE_LOG ?= /tmp/baton-bridge.log

# Colors for output
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
BLUE := \033[34m
RESET := \033[0m

.PHONY: help setup dev dev-full clean logs status bridge handler test-integration docker-up docker-down

# Default target
help: ## Show this help message
	@echo "$(BLUE)Baton - AI Task Management System$(RESET)"
	@echo "Available commands:"
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ { printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# Setup and Dependencies
setup: ## Install dependencies and setup database
	@echo "$(YELLOW)Setting up Baton development environment...$(RESET)"
	@cd backend && npm install
	@cd frontend && npm install
	@echo "$(GREEN)✓ Dependencies installed$(RESET)"
	@make docker-up
	@sleep 5
	@cd backend && npm run db:migrate
	@cd backend && npm run db:seed
	@echo "$(GREEN)✓ Database setup complete$(RESET)"

# Development Commands
dev: docker-up ## Start full development environment (Docker + Bridge + Handler)
	@echo "$(YELLOW)Starting Baton development environment...$(RESET)"
	@make bridge &
	@sleep 2
	@make handler &
	@sleep 2
	@echo "$(GREEN)✓ All services started$(RESET)"
	@echo "$(BLUE)Frontend:$(RESET) $(FRONTEND_URL)"
	@echo "$(BLUE)Backend:$(RESET) $(BACKEND_URL)"
	@echo "$(BLUE)Claude Code MCP:$(RESET) ws://localhost:$(MCP_PORT)"
	@echo "$(BLUE)Logs:$(RESET) make logs"

dev-full: setup dev ## Complete setup and start development environment

# Docker Services
docker-up: ## Start Docker containers (database, backend, frontend)
	@echo "$(YELLOW)Starting Docker containers...$(RESET)"
	@docker-compose up -d
	@sleep 3
	@echo "$(GREEN)✓ Docker containers started$(RESET)"

docker-down: ## Stop Docker containers
	@echo "$(YELLOW)Stopping Docker containers...$(RESET)"
	@docker-compose down
	@echo "$(GREEN)✓ Docker containers stopped$(RESET)"

# Claude Code Integration
bridge: ## Start chat bridge (connects frontend to Claude Code)
	@echo "$(YELLOW)Starting chat bridge...$(RESET)"
	@echo "$(BLUE)Bridge log:$(RESET) $(BRIDGE_LOG)"
	@BACKEND_URL=$(BACKEND_URL) nohup node scripts/chat-bridge.js > $(BRIDGE_LOG) 2>&1 &
	@echo $$! > /tmp/baton-bridge.pid
	@echo "$(GREEN)✓ Chat bridge started (PID: $$(cat /tmp/baton-bridge.pid))$(RESET)"

handler: ## Start chat handler (processes Claude Code interactions)
	@echo "$(YELLOW)Starting chat handler...$(RESET)"
	@echo "$(BLUE)Handler log:$(RESET) $(CHAT_HANDLER_LOG)"
	@BACKEND_URL=$(BACKEND_URL) nohup node scripts/chat-handler.js > $(CHAT_HANDLER_LOG) 2>&1 &
	@echo $$! > /tmp/baton-chat-handler.pid
	@echo "$(GREEN)✓ Chat handler started (PID: $$(cat /tmp/baton-chat-handler.pid))$(RESET)"

# Process Management
stop: ## Stop all Baton processes
	@echo "$(YELLOW)Stopping Baton processes...$(RESET)"
	@if [ -f /tmp/baton-bridge.pid ]; then \
		kill $$(cat /tmp/baton-bridge.pid) 2>/dev/null || true; \
		rm -f /tmp/baton-bridge.pid; \
		echo "$(GREEN)✓ Bridge stopped$(RESET)"; \
	fi
	@if [ -f /tmp/baton-chat-handler.pid ]; then \
		kill $$(cat /tmp/baton-chat-handler.pid) 2>/dev/null || true; \
		rm -f /tmp/baton-chat-handler.pid; \
		echo "$(GREEN)✓ Handler stopped$(RESET)"; \
	fi
	@pkill -f "chat-bridge.js" 2>/dev/null || true
	@pkill -f "chat-handler.js" 2>/dev/null || true

restart: stop dev ## Restart all services

status: ## Check status of all services
	@echo "$(BLUE)Baton Service Status:$(RESET)"
	@echo "----------------------------------------"
	@if docker ps | grep -q baton-postgres; then \
		echo "$(GREEN)✓ Database:$(RESET) Running"; \
	else \
		echo "$(RED)✗ Database:$(RESET) Stopped"; \
	fi
	@if docker ps | grep -q baton-backend; then \
		echo "$(GREEN)✓ Backend:$(RESET) Running ($(BACKEND_URL))"; \
	else \
		echo "$(RED)✗ Backend:$(RESET) Stopped"; \
	fi
	@if docker ps | grep -q baton-frontend; then \
		echo "$(GREEN)✓ Frontend:$(RESET) Running ($(FRONTEND_URL))"; \
	else \
		echo "$(RED)✗ Frontend:$(RESET) Stopped"; \
	fi
	@if [ -f /tmp/baton-bridge.pid ] && kill -0 $$(cat /tmp/baton-bridge.pid) 2>/dev/null; then \
		echo "$(GREEN)✓ Chat Bridge:$(RESET) Running (PID: $$(cat /tmp/baton-bridge.pid))"; \
	else \
		echo "$(RED)✗ Chat Bridge:$(RESET) Stopped"; \
	fi
	@if [ -f /tmp/baton-chat-handler.pid ] && kill -0 $$(cat /tmp/baton-chat-handler.pid) 2>/dev/null; then \
		echo "$(GREEN)✓ Chat Handler:$(RESET) Running (PID: $$(cat /tmp/baton-chat-handler.pid))"; \
	else \
		echo "$(RED)✗ Chat Handler:$(RESET) Stopped"; \
	fi

# Logging and Debugging
logs: ## Show real-time logs from all services
	@echo "$(BLUE)Viewing Baton logs (Ctrl+C to exit):$(RESET)"
	@echo "----------------------------------------"
	@tail -f $(CHAT_HANDLER_LOG) $(BRIDGE_LOG) docker-compose.log 2>/dev/null || true

logs-handler: ## Show chat handler logs only
	@tail -f $(CHAT_HANDLER_LOG)

logs-bridge: ## Show chat bridge logs only  
	@tail -f $(BRIDGE_LOG)

logs-docker: ## Show Docker container logs
	@docker-compose logs -f

# Testing
test-integration: ## Run integration tests for Claude Code connectivity
	@echo "$(YELLOW)Running Claude Code integration tests...$(RESET)"
	@echo "Testing chat handler connectivity..."
	@curl -s -X POST $(BACKEND_URL)/api/chat/messages \
		-H "Content-Type: application/json" \
		-d '{"conversationId": "test", "content": "Test integration"}' \
		> /dev/null && echo "$(GREEN)✓ Chat API accessible$(RESET)" || echo "$(RED)✗ Chat API failed$(RESET)"
	@echo "Testing MCP server..."
	@nc -z localhost $(MCP_PORT) && echo "$(GREEN)✓ MCP server accessible$(RESET)" || echo "$(RED)✗ MCP server unreachable$(RESET)"

test-claude-permissions: ## Test Claude Code permission modes
	@echo "$(YELLOW)Testing Claude Code permission handling...$(RESET)"
	@curl -s -X POST $(BACKEND_URL)/api/chat/messages \
		-H "Content-Type: application/json" \
		-d '{"conversationId": "test", "content": "Create test-permissions.txt with current timestamp"}' \
		--no-buffer | head -3
	@sleep 3
	@if [ -f test-permissions.txt ]; then \
		echo "$(GREEN)✓ Permission mode working - file created$(RESET)"; \
		rm -f test-permissions.txt; \
	else \
		echo "$(YELLOW)⚠ File not created - check handler logs$(RESET)"; \
	fi

# Database Management
db-reset: ## Reset and reseed database
	@echo "$(YELLOW)Resetting database...$(RESET)"
	@cd backend && npm run db:reset
	@echo "$(GREEN)✓ Database reset complete$(RESET)"

db-migrate: ## Run database migrations
	@cd backend && npm run db:migrate

db-seed: ## Seed database with sample data
	@cd backend && npm run db:seed

# Development Tools
lint: ## Run linting on all code
	@cd backend && npm run lint
	@cd frontend && npm run lint

build: ## Build production assets
	@cd backend && npm run build
	@cd frontend && npm run build

# Cleanup
clean: stop ## Stop services and clean up temporary files
	@echo "$(YELLOW)Cleaning up...$(RESET)"
	@rm -f /tmp/baton-*.pid /tmp/baton-*.log
	@docker-compose down -v 2>/dev/null || true
	@echo "$(GREEN)✓ Cleanup complete$(RESET)"

# Claude Code Integration Help
claude-help: ## Show Claude Code integration instructions
	@echo "$(BLUE)Baton + Claude Code Integration$(RESET)"
	@echo "====================================="
	@echo ""
	@echo "$(YELLOW)1. Start Baton Services:$(RESET)"
	@echo "   make dev"
	@echo ""
	@echo "$(YELLOW)2. Connect Claude Code to MCP:$(RESET)"
	@echo "   Add to ~/.claude.json:"
	@echo '   {'
	@echo '     "mcpServers": {'
	@echo '       "baton": {'
	@echo '         "command": "node",'
	@echo '         "args": ["$(PWD)/backend/dist/mcp/server/stdio.js"]'
	@echo '       }'
	@echo '     }'
	@echo '   }'
	@echo ""
	@echo "$(YELLOW)3. Test Integration:$(RESET)"
	@echo "   make test-integration"
	@echo ""
	@echo "$(YELLOW)4. Use Web Interface:$(RESET)"
	@echo "   Open $(FRONTEND_URL)"
	@echo ""
	@echo "$(YELLOW)Logs:$(RESET) make logs"
	@echo "$(YELLOW)Status:$(RESET) make status"