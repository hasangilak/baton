/**
 * Claude Code Interactive Prompt Detector
 * 
 * Detects and parses interactive prompts from Claude Code SDK messages,
 * including the common 3-option selection pattern shown in screenshots.
 */

class PromptDetector {
  static PATTERNS = {
    // Tool usage pattern from screenshot - more flexible matching
    TOOL_USAGE: /Tool use[\s\S]*?Do you want to proceed\?\s*[\s\S]*?>\s*1\.?\s*(.+?)[\s\S]*?>\s*2\.?\s*(.+?)[\s\S]*?>\s*3\.?\s*(.+?)(?:\s*\(esc\))?/i,
    
    // General permission pattern: "Can I edit this file?"
    PERMISSION: /^(?:Can I|May I|Should I)\s+(.+)\?/i,
    
    // Multiple choice with numbered options  
    MULTIPLE_CHOICE: /(?:Choose one(?:\s+\w+)*|Select an option|Which would you prefer|Here are your options?).*?:\s*\n((?:\s*\d+\.?\s*.+\n?)+)/i,
    
    // File selection pattern
    FILE_SELECTION: /(?:Which file|Select a file|Choose from)[\s\S]*?((?:\d+\.?\s*.+\n?)+)/i,
  };

  /**
   * Detect interactive prompts in Claude Code messages
   * @param {string} message - The message content to analyze
   * @returns {Object|null} Parsed prompt object or null if no prompt detected
   */
  static detectPrompt(message) {
    // Clean the message for better pattern matching
    const cleanMessage = message.trim();
    
    // Check for tool usage prompt (most common, like in screenshot)
    const toolMatch = this.detectToolUsagePrompt(cleanMessage);
    if (toolMatch) return toolMatch;
    
    // Check for permission prompt
    const permissionMatch = this.detectPermissionPrompt(cleanMessage);
    if (permissionMatch) return permissionMatch;
    
    // Check for multiple choice
    const choiceMatch = this.detectMultipleChoicePrompt(cleanMessage);
    if (choiceMatch) return choiceMatch;
    
    // Check for file selection
    const fileMatch = this.detectFileSelectionPrompt(cleanMessage);
    if (fileMatch) return fileMatch;
    
    return null;
  }

  /**
   * Detect tool usage prompts like "Tool use: exa - web_search_exa (MCP)"
   */
  static detectToolUsagePrompt(message) {
    const match = message.match(this.PATTERNS.TOOL_USAGE);
    if (!match) return null;

    const [, option1, option2, option3] = match;
    
    // Extract tool name from the message (it's before "Do you want to proceed")
    const toolMatch = message.match(/Tool use[\s\S]*?([a-zA-Z_-]+(?:\s*-\s*[a-zA-Z_-]+)*)\s*(?:\([^)]+\))?[\s\S]*?Do you want to proceed/i);
    const toolName = toolMatch?.[1]?.trim() || 'Unknown Tool';
    
    // Extract clean option text
    const options = [
      this.parseOption('1', option1),
      this.parseOption('2', option2), 
      this.parseOption('3', option3)
    ].filter(Boolean);

    return {
      type: 'tool_usage',
      title: 'Tool Usage Confirmation',
      message: `Tool use: ${toolName}`,
      context: {
        toolName: toolName,
        fullMessage: message
      },
      options,
      raw: match[0]
    };
  }

  /**
   * Detect permission prompts like "Can I edit this file?"
   */
  static detectPermissionPrompt(message) {
    const match = message.match(this.PATTERNS.PERMISSION);
    if (!match) return null;

    const [, action] = match;

    return {
      type: 'permission',
      title: 'Permission Request',
      message: match[0],
      context: {
        action: action?.trim(),
        fullMessage: message
      },
      options: [
        { id: '1', label: 'Yes', value: 'yes', isDefault: true },
        { id: '2', label: 'No', value: 'no' }
      ]
    };
  }

  /**
   * Detect multiple choice prompts
   */
  static detectMultipleChoicePrompt(message) {
    const match = message.match(this.PATTERNS.MULTIPLE_CHOICE);
    if (!match) return null;

    const [, optionsText] = match;
    const options = this.parseNumberedOptions(optionsText);

    return {
      type: 'multiple_choice',
      title: 'Multiple Choice Selection',
      message: message,
      context: {
        fullMessage: message
      },
      options
    };
  }

  /**
   * Detect file selection prompts
   */
  static detectFileSelectionPrompt(message) {
    const match = message.match(this.PATTERNS.FILE_SELECTION);
    if (!match) return null;

    const [, optionsText] = match;
    const options = this.parseNumberedOptions(optionsText);

    return {
      type: 'file_selection',
      title: 'File Selection',
      message: message,
      context: {
        fullMessage: message
      },
      options
    };
  }

  /**
   * Parse a single option from text like "1. Yes" or "> 2. Yes, and don't ask again"
   */
  static parseOption(id, optionText) {
    if (!optionText) return null;

    // Clean up the option text
    let cleanText = optionText
      .replace(/^>\s*/, '') // Remove leading >
      .replace(/^\d+\.?\s*/, '') // Remove leading number
      .replace(/\s*\(esc\)$/, '') // Remove trailing (esc)
      .trim();

    if (!cleanText) return null;

    // Determine option type based on content
    let value = 'unknown';
    let isDefault = false;
    let isRecommended = false;

    if (/^yes\s*$/i.test(cleanText)) {
      value = 'yes';
      isDefault = true;
    } else if (/yes.*don't ask/i.test(cleanText)) {
      value = 'yes_dont_ask';
      isRecommended = true;
    } else if (/no.*differently/i.test(cleanText)) {
      value = 'no_explain';
    } else if (/^no\s*$/i.test(cleanText)) {
      value = 'no';
    }

    return {
      id,
      label: cleanText,
      value,
      isDefault,
      isRecommended
    };
  }

  /**
   * Parse numbered options from text block
   */
  static parseNumberedOptions(optionsText) {
    const lines = optionsText.split('\n').filter(line => line.trim());
    const options = [];
    
    lines.forEach((line, index) => {
      const match = line.match(/^\s*(\d+)\.?\s*(.+)/);
      if (match) {
        const [, number, text] = match;
        options.push({
          id: number,
          label: text.trim(),
          value: text.trim().toLowerCase().replace(/[^a-z0-9]/g, '_'),
          isDefault: index === 0
        });
      }
    });

    return options;
  }

  /**
   * Validate that a prompt has the minimum required structure
   */
  static validatePrompt(prompt) {
    if (!prompt) return false;
    
    return !!(
      prompt.type &&
      prompt.message &&
      prompt.options &&
      Array.isArray(prompt.options) &&
      prompt.options.length > 0
    );
  }

  /**
   * Get a summary of the prompt for logging
   */
  static getPromptSummary(prompt) {
    if (!prompt) return 'No prompt';
    
    const optionCount = prompt.options?.length || 0;
    const context = prompt.context?.toolName || prompt.context?.action || 'unknown';
    
    return `${prompt.type} prompt for "${context}" with ${optionCount} options`;
  }
}

module.exports = { PromptDetector };