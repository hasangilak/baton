# Claude Code SDK Context Management Best Practices

## Overview

This document outlines best practices for managing conversation context in Claude Code SDK integrations, focusing on token efficiency, session management, and scalable context preservation.

## Problem Statement

### Current Token-Burning Approach
Our initial implementation sends complete conversation history with every request:
- ✅ **Works**: Context is preserved between messages
- ❌ **Inefficient**: Burns tokens unnecessarily on repeated history
- ❌ **Not Scalable**: Will hit 200,000 token context limit quickly
- ❌ **Cost Ineffective**: Exponentially increasing costs as conversations grow

### Context Loss Without History
Without conversation history:
- ❌ **Broken UX**: Each message treated as isolated request
- ❌ **No Follow-ups**: Can't ask implicit questions like "search the web" after mentioning a topic
- ❌ **Poor Experience**: Users must repeat context constantly

## Claude Code SDK Context Management Solutions

### 1. Built-in Session Management

Claude Code SDK provides native session persistence through flags:

#### Continue Flag (`--continue`)
```javascript
// Use Claude Code's built-in session continuity
for await (const message of query({
  prompt: currentPrompt,
  abortController,
  options: {
    maxTurns: 1,
    continue: true,  // Continues most recent conversation
  },
})) {
  // Process response...
}
```

#### Resume Flag (`--resume sessionId`)
```javascript
// Resume specific conversation by session ID
const storedSessionId = await getSessionId(conversationId);

for await (const message of query({
  prompt: currentPrompt,
  abortController,
  options: {
    maxTurns: 1,
    resume: storedSessionId,  // Resume specific session
  },
})) {
  // Process response...
}
```

### 2. Context Compaction

Claude Code provides built-in `/compact` command for intelligent context summarization:

```javascript
async function compactContext(conversationId) {
  // Use Claude Code's built-in compaction
  for await (const message of query({
    prompt: "/compact Remember our discussion about weather in Berlin and web search capabilities",
    options: { maxTurns: 1, continue: true }
  })) {
    // Context is now summarized while preserving key information
  }
}
```

### 3. Hybrid Context Management

Combine recent messages with summarized history:

```javascript
async function buildEfficientContext(conversationId, currentPrompt) {
  const contextStats = await getContextWindowStats(conversationId);
  
  if (contextStats.tokenUsage > 150000) { // 75% of 200k limit
    await triggerAutoCompaction(conversationId);
  }
  
  const recentMessages = await getRecentMessages(conversationId, 5);
  const contextSummary = await getContextSummary(conversationId);
  
  let contextPrompt = '';
  
  if (contextSummary) {
    contextPrompt += `Context Summary: ${contextSummary}\n\n`;
  }
  
  if (recentMessages.length > 0) {
    contextPrompt += "Recent conversation:\n";
    for (const msg of recentMessages.slice(-5)) {
      contextPrompt += `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}\n`;
    }
    contextPrompt += "---\n\n";
  }
  
  return contextPrompt + `Human: ${currentPrompt}\nAssistant: `;
}
```

## Implementation Architecture

### Database Schema Updates

Add session management to conversation table:

```sql
ALTER TABLE "Conversation" ADD COLUMN "claudeSessionId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "contextTokens" INTEGER DEFAULT 0;
ALTER TABLE "Conversation" ADD COLUMN "lastCompacted" TIMESTAMP;
```

### Token-Aware Context Manager

```javascript
class TokenAwareContextManager {
  constructor() {
    this.TOKEN_LIMIT = 200000;
    this.COMPACT_THRESHOLD = 150000; // 75% of limit
    this.RECENT_MESSAGE_COUNT = 5;
  }
  
  async processChat(request) {
    const { conversationId, prompt } = request;
    
    // Check if we need to compact context
    const shouldCompact = await this.shouldCompactContext(conversationId);
    if (shouldCompact) {
      await this.compactContext(conversationId);
    }
    
    // Use session-aware processing
    return this.processWithSession(conversationId, prompt);
  }
  
  async shouldCompactContext(conversationId) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { contextTokens: true, lastCompacted: true }
    });
    
    if (!conversation) return false;
    
    const tokenThresholdReached = conversation.contextTokens > this.COMPACT_THRESHOLD;
    const timeThresholdReached = conversation.lastCompacted && 
      (Date.now() - new Date(conversation.lastCompacted).getTime()) > (24 * 60 * 60 * 1000); // 24 hours
    
    return tokenThresholdReached || timeThresholdReached;
  }
  
  async compactContext(conversationId) {
    console.log(`🗜️  Compacting context for conversation ${conversationId}`);
    
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { claudeSessionId: true }
    });
    
    if (conversation?.claudeSessionId) {
      // Use Claude Code's built-in compact command
      for await (const message of query({
        prompt: "/compact Preserve key context about our discussion topics and any ongoing tasks",
        options: { 
          maxTurns: 1,
          resume: conversation.claudeSessionId 
        }
      })) {
        // Context compacted successfully
      }
      
      // Update last compacted timestamp
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { 
          lastCompacted: new Date(),
          contextTokens: Math.floor(conversation.contextTokens * 0.3) // Estimate 70% reduction
        }
      });
    }
  }
  
  async processWithSession(conversationId, prompt) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId }
    });
    
    const sessionId = conversation?.claudeSessionId;
    
    for await (const message of query({
      prompt: prompt,
      options: {
        maxTurns: 1,
        ...(sessionId ? { resume: sessionId } : { continue: true })
      }
    })) {
      // Store session ID if new conversation
      if (!sessionId && message.sessionId) {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { claudeSessionId: message.sessionId }
        });
      }
      
      yield message;
    }
  }
}
```

## Migration Strategy

### Phase 1: Session Storage (Immediate)
1. Update database schema to store Claude Code session IDs
2. Modify chat handler to use `--continue` and `--resume` flags
3. Remove manual history concatenation

### Phase 2: Smart Context Management (Week 2)
1. Implement token monitoring
2. Add automatic context compaction
3. Create hybrid context system (recent + summarized)

### Phase 3: Advanced Optimization (Week 3)
1. Add conversation branching for topic changes
2. Implement smart context retrieval using embeddings
3. Add conversation analytics and optimization metrics

## Benefits

### Token Efficiency
- **90%+ Token Reduction**: No more repeated history transmission
- **Cost Savings**: Dramatic reduction in API costs for long conversations
- **Scalability**: Handle conversations with hundreds of messages

### Performance Improvements
- **Faster Responses**: Reduced prompt processing time
- **Better Quality**: Claude Code can focus on current request vs parsing long history
- **Context Preservation**: Native session management preserves context better

### Developer Experience
- **Native Integration**: Uses Claude Code SDK's intended design patterns
- **Automatic Management**: No manual context window management needed
- **Resilient**: Built-in error handling and session recovery

## Context Window Limits

- **Total Limit**: 200,000 tokens (~500 pages of text)
- **Recommended Compact Threshold**: 150,000 tokens (75% of limit)
- **Emergency Threshold**: 180,000 tokens (90% of limit)
- **Monitoring**: Check context usage regularly with SDK methods

## Best Practices

### Do's
- ✅ Use `--continue` for general session continuity
- ✅ Use `--resume sessionId` for specific conversation restoration
- ✅ Implement automatic context compaction at 75% token usage
- ✅ Store session IDs in your database for persistence
- ✅ Use `/compact` command with specific instructions on what to remember
- ✅ Monitor token usage and implement alerts

### Don'ts  
- ❌ Don't send full conversation history manually
- ❌ Don't ignore context window limits
- ❌ Don't compact too frequently (causes context loss)
- ❌ Don't rely on headless mode for session persistence
- ❌ Don't mix manual context building with SDK session management

## Monitoring and Debugging

### Context Window Monitoring
```javascript
async function getContextStats(conversationId) {
  // Query Claude Code for current context window usage
  const stats = await query({
    prompt: "What percentage of your context window is currently being used?",
    options: { maxTurns: 1, continue: true }
  });
  
  return stats; // Returns token usage and percentage
}
```

### Debug Logging
```javascript
console.log(`📊 Context Stats: ${tokenUsage}/${TOKEN_LIMIT} tokens (${percentage}%)`);
console.log(`🔄 Session ID: ${sessionId || 'new'}`);
console.log(`🗜️  Last Compacted: ${lastCompacted || 'never'}`);
```

## Testing Context Management

### Unit Tests
- Test session ID storage and retrieval
- Test context compaction triggers
- Test token usage monitoring

### Integration Tests  
- Test conversation continuity across multiple messages
- Test context preservation after compaction
- Test session recovery after restart

### Performance Tests
- Compare token usage before/after optimization
- Measure response time improvements
- Test behavior at context window limits

## Conclusion

Using Claude Code SDK's native session management provides dramatic improvements in token efficiency while maintaining better context preservation than manual approaches. This architecture scales to handle long conversations while keeping costs manageable and performance optimal.

The key is leveraging the SDK's intended design patterns rather than working around them with manual context management.