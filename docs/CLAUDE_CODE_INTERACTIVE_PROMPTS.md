# Claude Code Interactive Prompts & 3-Option Selection Handling

## Overview

Claude Code frequently presents users with interactive prompts that interrupt the flow in headless environments. This document outlines our comprehensive plan to handle these prompts programmatically while maintaining safety and user control.

## Problem Analysis

### Common Interactive Prompt Types

1. **Permission Requests**
   - "Can I edit this file?"
   - "Can I run lint?"
   - "Can I create a new file?"

2. **Tool Usage Confirmations**
   ```
   Tool use: exa - web_search_exa (MCP)
   Do you want to proceed?
   > 1. Yes
   > 2. Yes, and don't ask again for exa - web_search_exa commands in /path/to/project
   > 3. No, and tell Claude what to do differently (esc)
   ```

3. **Multiple Choice Options**
   - File selection from multiple candidates
   - Implementation strategy choices
   - Configuration preferences

4. **3-Option Selection Pattern** (Most Common)
   - **Option 1**: Immediate approval ("Yes")
   - **Option 2**: Approval with future auto-handling ("Yes, and don't ask again")
   - **Option 3**: Denial with explanation request ("No, and tell Claude what to do differently")

## Architecture Design

### Core Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Claude Code   │───▶│  Prompt Detector │───▶│ Decision Engine │
│   SDK Query     │    │  & Parser        │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   Database       │    │   WebSocket     │
                       │   Storage        │    │   to Frontend   │
                       └──────────────────┘    └─────────────────┘
```

### Data Models

```typescript
interface InteractivePrompt {
  id: string;
  conversationId: string;
  sessionId: string;
  type: 'permission' | 'tool_usage' | 'multiple_choice' | 'three_option';
  title: string;
  message: string;
  options: PromptOption[];
  context: PromptContext;
  status: 'pending' | 'answered' | 'timeout' | 'auto_handled';
  selectedOption?: string;
  autoHandler?: string;
  createdAt: Date;
  respondedAt?: Date;
  timeoutAt: Date;
}

interface PromptOption {
  id: string;
  label: string;
  value: string;
  isDefault?: boolean;
  isRecommended?: boolean;
}

interface PromptContext {
  toolName?: string;
  filePath?: string;
  command?: string;
  projectPath?: string;
}
```

## Implementation Plan

### Phase 1: Prompt Detection & Classification

#### 1.1 Enhanced Chat Handler Message Processing

```javascript
class PromptDetector {
  static PATTERNS = {
    // Tool usage pattern from screenshot
    TOOL_USAGE: /Tool use:\s+(.+)\s+\((.+)\)[\s\S]*?Do you want to proceed\?[\s\S]*?>\s*1\.\s*(.+)[\s\S]*?>\s*2\.\s*(.+)[\s\S]*?>\s*3\.\s*(.+)/,
    
    // General permission pattern
    PERMISSION: /^(?:Can I|May I|Should I)\s(.+)\?$/,
    
    // Three-option pattern
    THREE_OPTIONS: /^(?:Here are three approaches|Choose one option|Select an option):\s*\n(?:\s*(?:\d+\.)?\s*(.+)\n?)+$/,
    
    // File selection pattern
    FILE_SELECTION: /(?:Which file|Select a file|Choose from)[\s\S]*?(?:\d+\.\s*.+\n?)+/
  };

  static detectPrompt(message) {
    // Check for tool usage prompt (like in screenshot)
    const toolMatch = message.match(this.PATTERNS.TOOL_USAGE);
    if (toolMatch) {
      return {
        type: 'tool_usage',
        title: 'Tool Usage Confirmation',
        message: `Tool use: ${toolMatch[1]} (${toolMatch[2]})`,
        context: {
          toolName: toolMatch[1],
          toolType: toolMatch[2]
        },
        options: [
          { id: '1', label: toolMatch[3], value: 'yes', isDefault: true },
          { id: '2', label: toolMatch[4], value: 'yes_dont_ask', isRecommended: true },
          { id: '3', label: toolMatch[5], value: 'no_explain' }
        ]
      };
    }

    // Check other patterns...
    for (const [type, pattern] of Object.entries(this.PATTERNS)) {
      const match = message.match(pattern);
      if (match) {
        return this.parsePrompt(message, type.toLowerCase(), match);
      }
    }
    
    return null;
  }
}
```

#### 1.2 Database Schema Extension

```sql
-- Add to existing migration
CREATE TABLE interactive_prompts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id VARCHAR NOT NULL,
  session_id VARCHAR,
  type VARCHAR NOT NULL,
  title VARCHAR,
  message TEXT NOT NULL,
  options JSON NOT NULL,
  context JSON,
  status VARCHAR DEFAULT 'pending',
  selected_option VARCHAR,
  auto_handler VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  responded_at TIMESTAMP,
  timeout_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 seconds'),
  
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE INDEX idx_interactive_prompts_conversation ON interactive_prompts(conversation_id);
CREATE INDEX idx_interactive_prompts_status ON interactive_prompts(status);
CREATE INDEX idx_interactive_prompts_timeout ON interactive_prompts(timeout_at);
```

### Phase 2: Decision Engine Implementation

#### 2.1 Multi-Strategy Decision Engine

```javascript
class PromptDecisionEngine {
  constructor() {
    this.strategies = [
      new AllowlistStrategy(),
      new DenylistStrategy(),
      new LLMDecisionStrategy(),
      new UserDelegationStrategy()
    ];
  }

  async handlePrompt(prompt) {
    console.log(`🤔 Processing interactive prompt: ${prompt.title}`);
    
    for (const strategy of this.strategies) {
      if (strategy.canHandle(prompt)) {
        const decision = await strategy.decide(prompt);
        if (decision) {
          console.log(`✅ Decision made by ${strategy.constructor.name}: ${decision.action}`);
          return await this.executeDecision(prompt, decision);
        }
      }
    }
    
    // Fallback to user delegation
    console.log(`👤 Delegating to user: ${prompt.title}`);
    return await this.delegateToUser(prompt);
  }

  async executeDecision(prompt, decision) {
    // Update prompt status
    await prisma.interactivePrompt.update({
      where: { id: prompt.id },
      data: {
        status: 'auto_handled',
        selectedOption: decision.selectedOption,
        autoHandler: decision.handler,
        respondedAt: new Date()
      }
    });

    // Send response to Claude Code SDK
    return decision;
  }
}
```

#### 2.2 Allowlist Strategy for Common Tools

```javascript
class AllowlistStrategy {
  constructor() {
    // Based on screenshot and common patterns
    this.toolAllowlist = {
      'exa - web_search_exa': { action: 'yes_dont_ask', confidence: 0.95 },
      'mcp__exa__web_search_exa': { action: 'yes_dont_ask', confidence: 0.95 },
      'Read': { action: 'yes_dont_ask', confidence: 0.9 },
      'Write': { action: 'yes', confidence: 0.8 }, // Be more cautious with writes
      'Bash': { action: 'conditional', confidence: 0.7 }
    };
    
    this.commandAllowlist = [
      /^npm (install|run|start|build|test)/,
      /^git (status|add|commit|push|pull)/,
      /^ls|cat|grep|find/,
      /^node|python|go run/
    ];
  }

  canHandle(prompt) {
    return prompt.type === 'tool_usage' || prompt.type === 'permission';
  }

  decide(prompt) {
    if (prompt.type === 'tool_usage' && prompt.context?.toolName) {
      const toolConfig = this.toolAllowlist[prompt.context.toolName];
      if (toolConfig) {
        return {
          action: toolConfig.action,
          selectedOption: this.mapActionToOption(toolConfig.action, prompt.options),
          confidence: toolConfig.confidence,
          handler: 'allowlist',
          reason: `Tool ${prompt.context.toolName} is pre-approved`
        };
      }
    }
    
    return null; // Cannot decide
  }

  mapActionToOption(action, options) {
    switch (action) {
      case 'yes': return options.find(o => o.value === 'yes')?.id;
      case 'yes_dont_ask': return options.find(o => o.value === 'yes_dont_ask')?.id;
      case 'no_explain': return options.find(o => o.value === 'no_explain')?.id;
      default: return options[0]?.id; // Default to first option
    }
  }
}
```

### Phase 3: User Delegation System

#### 3.1 Frontend Interactive Prompt Modal

Based on the screenshot, we need a modal that closely resembles Claude Code's interface:

```tsx
interface InteractivePromptModalProps {
  prompt: InteractivePrompt;
  onResponse: (selectedOptionId: string) => void;
  onTimeout: () => void;
}

const InteractivePromptModal: React.FC<InteractivePromptModalProps> = ({
  prompt,
  onResponse,
  onTimeout
}) => {
  const [timeLeft, setTimeLeft] = useState(30);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Auto-select recommended option on timeout
          const recommendedOption = prompt.options.find(o => o.isRecommended) 
            || prompt.options.find(o => o.isDefault)
            || prompt.options[0];
          onResponse(recommendedOption.id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [onTimeout, prompt.options]);

  const handleOptionSelect = (optionId: string) => {
    setSelectedOption(optionId);
    onResponse(optionId);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#2D2D30] border border-[#3E3E42] rounded-lg p-6 max-w-2xl w-full mx-4">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-3 h-3 rounded-full bg-[#FF6B6B]" />
          <h3 className="text-[#E5E5E5] text-lg font-medium">
            {prompt.title || 'Claude Code needs input'}
          </h3>
          <div className="ml-auto text-sm text-[#8B8B8D]">
            {timeLeft}s remaining
          </div>
        </div>

        {/* Tool use info (matching screenshot) */}
        {prompt.type === 'tool_usage' && (
          <div className="bg-[#3E3E42] rounded p-3 mb-4">
            <div className="text-[#E5E5E5] font-mono text-sm">Tool use</div>
            <div className="text-[#8B8B8D] text-sm mt-1">
              {prompt.message}
            </div>
          </div>
        )}

        <p className="text-[#8B8B8D] mb-4">Do you want to proceed?</p>

        <div className="space-y-2">
          {prompt.options.map((option, index) => (
            <button
              key={option.id}
              onClick={() => handleOptionSelect(option.id)}
              className={`w-full p-3 text-left rounded-lg border transition-colors ${
                option.isRecommended 
                  ? 'border-[#FF6B6B] bg-[#FF6B6B]/10 text-[#E5E5E5]'
                  : 'border-[#3E3E42] bg-[#252526] text-[#8B8B8D] hover:bg-[#2D2D30] hover:text-[#E5E5E5]'
              }`}
            >
              <div className="flex items-start space-x-2">
                <span className="text-[#8B8B8D] font-mono">
                  {index + 1}.
                </span>
                <span className="flex-1">{option.label}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 text-xs text-[#8B8B8D]">
          {timeLeft > 0 && (
            <>Auto-selecting recommended option in {timeLeft} seconds</>
          )}
        </div>
      </div>
    </div>
  );
};
```

#### 3.2 WebSocket Integration

```javascript
// Backend: Detect and forward prompts
class ChatHandler {
  async processMessage(message) {
    // ... existing processing ...
    
    const prompt = PromptDetector.detectPrompt(message.content);
    if (prompt) {
      console.log(`🔔 Interactive prompt detected: ${prompt.title}`);
      
      // Store in database
      const storedPrompt = await prisma.interactivePrompt.create({
        data: {
          conversationId: this.conversationId,
          sessionId: this.sessionId,
          type: prompt.type,
          title: prompt.title,
          message: prompt.message,
          options: prompt.options,
          context: prompt.context,
          timeoutAt: new Date(Date.now() + 30000) // 30 second timeout
        }
      });

      // Try decision engine first
      const decision = await this.decisionEngine.handlePrompt(storedPrompt);
      
      if (!decision) {
        // Forward to frontend for user input
        io.to(`conversation-${this.conversationId}`).emit('interactive_prompt', {
          promptId: storedPrompt.id,
          ...prompt,
          timeout: 30000
        });
        
        // Wait for response or timeout
        return await this.waitForPromptResponse(storedPrompt.id);
      }
      
      return decision;
    }
    
    // ... continue normal processing ...
  }
}
```

### Phase 4: Integration with Chat Handler

#### 4.1 Enhanced Message Processing Loop

```javascript
// In scripts/chat-handler.js
for await (const message of query({
  prompt: contextPrompt,
  options: sessionOptions.options
})) {
  console.log(`Received message type: ${message.type}`);
  
  if (message.type === 'assistant') {
    const textContent = this.extractTextContent(message.message.content);
    
    // Check for interactive prompts
    const prompt = PromptDetector.detectPrompt(textContent);
    if (prompt) {
      console.log(`🔔 Interactive prompt detected: ${prompt.title}`);
      
      // Handle the prompt
      const response = await this.handleInteractivePrompt(prompt);
      
      // Send response back to Claude Code
      if (response.action === 'yes' || response.action === 'yes_dont_ask') {
        // Continue with the tool usage
        continue;
      } else {
        // Send explanation or cancellation
        // This would require additional Claude Code SDK integration
      }
    }
    
    // Regular message processing
    await this.processMessage(textContent, message.id);
  }
}
```

## Benefits of This Architecture

1. **Seamless Automation**: Handle routine prompts (like web search) automatically
2. **User Control**: Delegate complex decisions to users with visual feedback
3. **Safety First**: Built-in deny patterns prevent dangerous operations
4. **Flexibility**: Multiple strategies can be combined and prioritized
5. **Transparency**: All decisions logged and visible to users
6. **Timeout Handling**: Auto-select safe options if user doesn't respond
7. **Context Awareness**: Decisions based on tool type, project context, and history

## Configuration Options

Users will be able to configure:
- Auto-approval rules for specific tools
- Timeout durations
- Default actions for different prompt types
- Project-specific allowlists/denylists

This comprehensive solution handles Claude Code's interactive prompts while maintaining the balance between automation and user control, specifically addressing the 3-option selection pattern shown in the screenshot.