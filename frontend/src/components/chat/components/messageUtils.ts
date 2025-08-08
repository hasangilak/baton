// (Removed unused Message type import)

export const safeRenderContent = (content: any, _streamingMessage?: any): string => {
  if (content === null || content === undefined) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'number' || typeof content === 'boolean') return String(content);
  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          if ((item as any).type === 'text' && (item as any).text) return (item as any).text;
          return JSON.stringify(item, null, 2);
        }
        return String(item);
      })
      .join('\n');
  }
  if (typeof content === 'object') {
    if ((content as any).type === 'text' && (content as any).text) return (content as any).text;
    try { return JSON.stringify(content, null, 2); } catch { return String(content); }
  }
  return String(content);
};

export const extractMessageContent = (msg: any): string => {
  const msgType = msg.type;
  switch (msgType) {
    case 'system': {
      if (msg.subtype === 'init') {
        const data = msg.data || msg;
        const session = data.session_id;
        const model = data.model || 'Claude';
        const toolCount = data.tools?.length || 0;
        return `Session initialized with ${model}\nSession ID: ${session}\nAvailable tools: ${toolCount}`;
      }
      return msg.message || msg.content || 'System message';
    }
    case 'result': {
      const data = msg.data || msg;
      const result = data.result || msg.result || '';
      const cost = data.total_cost_usd || 0;
      const duration = data.duration_ms || 0;
      const usage = data.usage;
      let resultContent = `${result}`;
      if (cost > 0 || duration > 0) {
        resultContent += '\n\n';
        if (duration > 0) resultContent += `Duration: ${duration}ms`;
        if (cost > 0) resultContent += `${duration > 0 ? ', ' : ''}Cost: $${cost.toFixed(4)}`;
        if (usage?.output_tokens) resultContent += `\nTokens: ${usage.output_tokens} output`;
      }
      return resultContent;
    }
    case 'chat':
      return safeRenderContent(msg.content);
    default:
      return safeRenderContent(msg.message || msg.content || msg);
  }
};
