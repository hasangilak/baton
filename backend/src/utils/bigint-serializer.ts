/**
 * Utility functions for handling BigInt serialization in JSON responses
 * 
 * BigInt values cannot be directly serialized to JSON, so we need to convert them
 * to strings or numbers before sending to the frontend.
 */

/**
 * Convert BigInt values to strings recursively in an object
 * @param obj - Object that may contain BigInt values
 * @returns Object with BigInt values converted to strings
 */
export function serializeBigInt<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'bigint') {
    return String(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => serializeBigInt(item)) as T;
  }

  if (typeof obj === 'object') {
    const serialized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      serialized[key] = serializeBigInt(value);
    }
    return serialized as T;
  }

  return obj;
}

/**
 * Custom JSON.stringify replacer function that handles BigInt values
 * @param key - The key being stringified
 * @param value - The value being stringified
 * @returns The value to be stringified, with BigInt converted to string
 */
export function bigIntReplacer(key: string, value: any): any {
  if (typeof value === 'bigint') {
    return String(value);
  }
  return value;
}

/**
 * Safe JSON.stringify that handles BigInt values
 * @param obj - Object to stringify
 * @param space - Optional spacing parameter for JSON.stringify
 * @returns JSON string with BigInt values converted to strings
 */
export function stringifyWithBigInt(obj: any, space?: string | number): string {
  return JSON.stringify(obj, bigIntReplacer, space);
}

/**
 * Transform a Prisma Message object to be JSON-safe
 * Specifically handles the timestamp field which is BigInt
 */
export function serializeMessage(message: any) {
  return {
    ...message,
    timestamp: message.timestamp ? String(message.timestamp) : null,
    // Handle any nested objects that might contain BigInt
    claudeData: message.claudeData ? serializeBigInt(message.claudeData) : null,
    usage: message.usage ? serializeBigInt(message.usage) : null,
    metadata: message.metadata ? serializeBigInt(message.metadata) : null,
  };
}

/**
 * Transform an array of Prisma Message objects to be JSON-safe
 */
export function serializeMessages(messages: any[]): any[] {
  return messages.map(serializeMessage);
}